
import "dotenv/config";

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getConfig(): LlmConfig {
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;

  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
    throw new LlmError(
      "Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in your environment.",
      "LLM_NOT_CONFIGURED",
    );
  }

  let baseUrl: URL;

  try {
    baseUrl = new URL(LLM_BASE_URL);
  } catch {
    throw new LlmError("LLM_BASE_URL is invalid.", "INVALID_CONFIG");
  }

  if (!["https:", "http:"].includes(baseUrl.protocol)) {
    throw new LlmError("Unsupported LLM URL protocol.", "INVALID_CONFIG");
  }

  if (
    baseUrl.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname)
  ) {
    throw new LlmError(
      "Non-local LLM endpoints must use HTTPS.",
      "INVALID_CONFIG",
    );
  }

  return {
    baseUrl: baseUrl.toString().replace(/\/+$/, ""),
    apiKey: LLM_API_KEY,
    model: LLM_MODEL,
  };
}

export function parseRetryDelay(
  response: Response | undefined,
  errorMessage?: string,
  attempt = 1,
): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.round(seconds * 1000) + 300, 15_000);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      const diff = date - Date.now();
      if (diff > 0) {
        return Math.min(diff + 300, 15_000);
      }
    }
  }

  const resetHeader =
    response?.headers.get("x-ratelimit-reset-tokens") ||
    response?.headers.get("x-ratelimit-reset-requests");
  if (resetHeader) {
    const match = resetHeader.match(
      /^(\d+(?:\.\d+)?)\s*(s|sec|seconds|ms|m|min)?$/i,
    );
    if (match) {
      const val = parseFloat(match[1]);
      const unit = (match[2] || "s").toLowerCase();
      const ms =
        unit === "ms" ? val : unit.startsWith("m") ? val * 60_000 : val * 1000;
      return Math.min(Math.round(ms) + 300, 15_000);
    }
  }

  if (errorMessage) {
    // Check milliseconds first so 'ms' is not matched by minutes or seconds
    const msMatch = errorMessage.match(
      /try again in\s+(\d+(?:\.\d+)?)\s*ms\b/i,
    );
    if (msMatch) {
      return Math.min(Math.round(parseFloat(msMatch[1])) + 300, 15_000);
    }

    const minSecMatch = errorMessage.match(
      /try again in\s+(\d+(?:\.\d+)?)\s*(?:minutes|min|m)(?:[,\s]*(\d+(?:\.\d+)?)\s*(?:seconds|sec|s)?)?/i,
    );
    if (minSecMatch) {
      const mins = parseFloat(minSecMatch[1]);
      const secs = minSecMatch[2] ? parseFloat(minSecMatch[2]) : 0;
      return Math.min(Math.round((mins * 60 + secs) * 1000) + 300, 15_000);
    }

    const secMatch = errorMessage.match(
      /try again in\s+(\d+(?:\.\d+)?)\s*(?:seconds|sec|s)\b/i,
    );
    if (secMatch) {
      return Math.min(Math.round(parseFloat(secMatch[1]) * 1000) + 300, 15_000);
    }
  }

  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(withoutFence);
  } catch {
    throw new LlmError(
      "The model did not return valid JSON.",
      "INVALID_MODEL_JSON",
    );
  }
}

export function redactSecrets(text: string, apiKey?: string): string {
  let result = text;
  if (apiKey) {
    result = result.split(apiKey).join("[REDACTED]");
  }
  result = result.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]");
  result = result.replace(/(?:sk-|gsk_)[A-Za-z0-9_-]{10,}/gi, "[REDACTED_KEY]");
  return result;
}

export function extractProviderError(
  status: number,
  bodyText: string,
  apiKey?: string,
): { message: string; type: string; code?: string } {
  const sanitized = redactSecrets(bodyText, apiKey);
  try {
    const json = JSON.parse(sanitized);
    const err = json?.error ?? json;
    if (err && typeof err === "object") {
      return {
        message:
          typeof err.message === "string" ? err.message : sanitized.slice(0, 500),
        type: typeof err.type === "string" ? err.type : "provider_error",
        code: typeof err.code === "string" ? err.code : undefined,
      };
    }
  } catch {
    // not JSON
  }
  return {
    message: sanitized.slice(0, 500) || `HTTP ${status}`,
    type: "provider_error",
  };
}

let requestQueue = Promise.resolve();

export function resetRequestQueue(): void {
  requestQueue = Promise.resolve();
}

export function enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
  const next = requestQueue.then(fn, fn);
  requestQueue = next.then(() => {}, () => {});
  return next;
}

async function executeGenerateStructuredJson(
  prompt: string,
): Promise<unknown> {
  const config = getConfig();
  const endpoint = `${config.baseUrl}/chat/completions`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.1,
          max_completion_tokens: 1500,
          messages: [
            {
              role: "system",
              content:
                "Follow the user's instructions. Return only a valid, strictly formatted JSON object. Do not wrap it in Markdown. Ensure all string values are properly escaped without raw unescaped newlines.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const isLastAttempt = attempt === MAX_ATTEMPTS;
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");

      if (isLastAttempt) {
        throw new LlmError(
          isTimeout ? "LLM request timed out." : "LLM request failed.",
          isTimeout ? "LLM_TIMEOUT" : "LLM_NETWORK_ERROR",
          true,
        );
      }

      await sleep(parseRetryDelay(undefined, undefined, attempt));
      continue;
    }

    if (response.ok) {
      let payload: {
        choices?: Array<{ message?: { content?: unknown } }>;
      };

      try {
        payload = await response.json();
      } catch {
        throw new LlmError("Invalid LLM response body.", "INVALID_RESPONSE");
      }

      const content = payload.choices?.[0]?.message?.content;

      if (typeof content !== "string") {
        throw new LlmError(
          "LLM response did not contain text content.",
          "EMPTY_MODEL_RESPONSE",
        );
      }

      return extractJson(content);
    }

    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      // ignore
    }

    const providerError = extractProviderError(
      response.status,
      bodyText,
      config.apiKey,
    );
    console.error(
      `[LLM Client] Provider returned HTTP ${response.status}:`,
      JSON.stringify(providerError),
    );

    const isRateLimit = response.status === 429;
    const isJsonValidationFailure =
      response.status === 400 &&
      (providerError.code === "json_validate_failed" ||
        providerError.message?.toLowerCase().includes("failed to validate json"));

    const retryable =
      isRateLimit || response.status >= 500 || isJsonValidationFailure;

    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new LlmError(
        isRateLimit
          ? "The AI provider's rate limit was exceeded. Please try again in a moment."
          : `LLM provider returned HTTP ${response.status}.`,
        isRateLimit ? "LLM_RATE_LIMIT" : "LLM_HTTP_ERROR",
        retryable,
      );
    }

    const delay = parseRetryDelay(response, providerError.message, attempt);
    if (isRateLimit) {
      console.warn(
        `[LLM Client] Rate limit encountered (429). Retrying after ${delay}ms delay (attempt ${attempt}/${MAX_ATTEMPTS})...`,
      );
    }
    await sleep(delay);
  }

  throw new LlmError("LLM request attempts exhausted.", "LLM_RETRIES_EXHAUSTED");
}

export async function generateStructuredJson(
  prompt: string,
): Promise<unknown> {
  return enqueueRequest(() => executeGenerateStructuredJson(prompt));
}
