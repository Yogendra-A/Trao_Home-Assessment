
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

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 10_000);
    }

    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.min(Math.max(0, date - Date.now()), 10_000);
    }
  }

  return Math.min(500 * 2 ** (attempt - 1), 4000);
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

export async function generateStructuredJson(
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
          messages: [
            {
              role: "system",
              content:
                "Follow the user's instructions. Return only a valid JSON object. Do not wrap it in Markdown.",
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

      await sleep(retryDelay(undefined, attempt));
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

    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable || attempt === MAX_ATTEMPTS) {
      // Do not include response bodies: they may contain sensitive information.
      throw new LlmError(
        `LLM provider returned HTTP ${response.status}.`,
        response.status === 429 ? "LLM_RATE_LIMIT" : "LLM_HTTP_ERROR",
        retryable,
      );
    }

    const delay = retryDelay(response, attempt);
    await response.body?.cancel();
    await sleep(delay);
  }

  throw new LlmError("LLM request attempts exhausted.", "LLM_RETRIES_EXHAUSTED");
}
