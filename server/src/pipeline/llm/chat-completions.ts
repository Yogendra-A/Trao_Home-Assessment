import "dotenv/config";
import { z } from "zod";

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false,
    public readonly providerMessage?: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface GenerateOptions<T = unknown> {
  stage?: string;
  schema?: z.ZodType<T>;
  maxTokens?: number;
}

export interface TokenUsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
  retries: number;
  rateLimitErrors: number;
  stages: Record<string, { promptTokens: number; completionTokens: number; calls: number }>;
}

let globalTokenStats: TokenUsageStats = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  calls: 0,
  retries: 0,
  rateLimitErrors: 0,
  stages: {},
};

export function getTokenStats(): TokenUsageStats {
  return JSON.parse(JSON.stringify(globalTokenStats));
}

export function resetTokenStats(): void {
  globalTokenStats = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    calls: 0,
    retries: 0,
    rateLimitErrors: 0,
    stages: {},
  };
}

export interface RateLimitStatus {
  limitTokens: number;
  remainingTokens: number;
  resetTokensMs: number;
  limitRequests: number;
  remainingRequests: number;
  resetRequestsMs: number;
  lastUpdated: number;
}

let currentRateLimit: RateLimitStatus = {
  limitTokens: 8000,
  remainingTokens: 8000,
  resetTokensMs: 0,
  limitRequests: 30,
  remainingRequests: 30,
  resetRequestsMs: 0,
  lastUpdated: 0,
};

export function getRateLimitStatus(): RateLimitStatus {
  return { ...currentRateLimit };
}

export function resetRateLimitStatus(): void {
  currentRateLimit = {
    limitTokens: 8000,
    remainingTokens: 8000,
    resetTokensMs: 0,
    limitRequests: 30,
    remainingRequests: 30,
    resetRequestsMs: 0,
    lastUpdated: 0,
  };
}

function parseResetHeaderMs(headerValue: string): number {
  const match = headerValue.match(/^(\d+(?:\.\d+)?)\s*(s|sec|seconds|ms|m|min)?$/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  return unit === "ms" ? Math.round(val) : unit.startsWith("m") ? Math.round(val * 60_000) : Math.round(val * 1000);
}

export function updateRateLimitFromHeaders(headers: Headers): void {
  const limitTokens = headers.get("x-ratelimit-limit-tokens");
  const remainingTokens = headers.get("x-ratelimit-remaining-tokens");
  const resetTokens = headers.get("x-ratelimit-reset-tokens");
  const limitRequests = headers.get("x-ratelimit-limit-requests");
  const remainingRequests = headers.get("x-ratelimit-remaining-requests");
  const resetRequests = headers.get("x-ratelimit-reset-requests");

  if (limitTokens) {
    const val = parseInt(limitTokens, 10);
    if (!isNaN(val)) currentRateLimit.limitTokens = val;
  }
  if (remainingTokens) {
    const val = parseInt(remainingTokens, 10);
    if (!isNaN(val)) currentRateLimit.remainingTokens = val;
  }
  if (resetTokens) {
    currentRateLimit.resetTokensMs = parseResetHeaderMs(resetTokens);
  }
  if (limitRequests) {
    const val = parseInt(limitRequests, 10);
    if (!isNaN(val)) currentRateLimit.limitRequests = val;
  }
  if (remainingRequests) {
    const val = parseInt(remainingRequests, 10);
    if (!isNaN(val)) currentRateLimit.remainingRequests = val;
  }
  if (resetRequests) {
    currentRateLimit.resetRequestsMs = parseResetHeaderMs(resetRequests);
  }
  currentRateLimit.lastUpdated = Date.now();
}

export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

async function paceBeforeRequest(estimatedRequiredTokens: number): Promise<void> {
  const now = Date.now();
  const timeSinceLastHeader = now - currentRateLimit.lastUpdated;

  if (currentRateLimit.lastUpdated > 0 && timeSinceLastHeader < 60_000) {
    if (timeSinceLastHeader >= currentRateLimit.resetTokensMs) {
      currentRateLimit.remainingTokens = currentRateLimit.limitTokens;
    } else if (currentRateLimit.resetTokensMs > 0) {
      const ratio = timeSinceLastHeader / currentRateLimit.resetTokensMs;
      const replenished = Math.floor(currentRateLimit.limitTokens * ratio);
      currentRateLimit.remainingTokens = Math.min(
        currentRateLimit.limitTokens,
        currentRateLimit.remainingTokens + replenished,
      );
    }

    if (currentRateLimit.remainingTokens < estimatedRequiredTokens) {
      const waitNeeded = Math.max(
        0,
        currentRateLimit.resetTokensMs - timeSinceLastHeader + 250,
      );
      const boundedWait = Math.min(Math.max(waitNeeded, 800), 12_000);
      console.warn(
        `[LLM Scheduler] Pacing request: remaining tokens (${currentRateLimit.remainingTokens}) < required (${estimatedRequiredTokens}). Proactively pausing ${boundedWait}ms to prevent HTTP 429...`,
      );
      await sleep(boundedWait);
      currentRateLimit.remainingTokens = currentRateLimit.limitTokens;
    }
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
  withJitter = false,
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

  // Bounded exponential backoff with optional random jitter
  const baseDelay = Math.min(1000 * 2 ** (attempt - 1), 8000);
  if (withJitter) {
    const jitter = Math.floor(Math.random() * 300) + 50;
    return Math.min(baseDelay + jitter, 8000);
  }
  return baseDelay;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractJson(content: string): unknown {
  const trimmed = content.trim();

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2. Stripped markdown codeblock
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // 3. Scan for outermost JSON object or array
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // continue
    }
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
    } catch {
      // continue
    }
  }

  throw new LlmError(
    "The model did not return valid JSON.",
    "INVALID_MODEL_JSON",
    true,
  );
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
): { message: string; type: string; code?: string; failedGeneration?: string } {
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
        failedGeneration:
          typeof err.failed_generation === "string"
            ? err.failed_generation
            : undefined,
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

async function executeGenerateStructuredJson<T = unknown>(
  prompt: string,
  options?: GenerateOptions<T>,
): Promise<T> {
  const config = getConfig();
  const endpoint = `${config.baseUrl}/chat/completions`;
  const stage = options?.stage || "llm_generation";
  let useJsonObjectMode = true;
  let correctiveFeedback = "";

  const defaultTokens =
    config.model.includes("oss-20b") ||
    config.model.includes("r1") ||
    config.model.includes("reasoning")
      ? 1800
      : 1500;

  const targetMaxTokens = options?.maxTokens || defaultTokens;
  const estimatedInput = estimateInputTokens(prompt);
  const estimatedDemand = estimatedInput + targetMaxTokens;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Coordinate rate-limit budget before dispatching
    await paceBeforeRequest(estimatedDemand);

    let response: Response;

    const messages = [
      {
        role: "system",
        content: useJsonObjectMode
          ? "Follow the user's instructions. Return only a valid, strictly formatted JSON object. Do not wrap it in Markdown. Ensure all string values are properly escaped without raw unescaped newlines."
          : "You are a specialized JSON assistant. Return ONLY a valid JSON object matching the requested fields. Do not include markdown code blocks, conversational introductions, or commentary. Output raw JSON directly.",
      },
      {
        role: "user",
        content: correctiveFeedback ? `${prompt}\n\n${correctiveFeedback}` : prompt,
      },
    ];

    const bodyPayload: Record<string, unknown> = {
      model: config.model,
      temperature: 0.1,
      max_completion_tokens: targetMaxTokens,
      messages,
    };

    if (useJsonObjectMode) {
      bodyPayload.response_format = { type: "json_object" };
    }

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
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

    updateRateLimitFromHeaders(response.headers);

    if (response.ok) {
      let payload: {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      try {
        payload = await response.json();
      } catch {
        throw new LlmError("Invalid LLM response body.", "INVALID_RESPONSE");
      }

      if (payload.usage) {
        const pTokens = payload.usage.prompt_tokens || 0;
        const cTokens = payload.usage.completion_tokens || 0;
        const tTokens = payload.usage.total_tokens || (pTokens + cTokens);
        globalTokenStats.promptTokens += pTokens;
        globalTokenStats.completionTokens += cTokens;
        globalTokenStats.totalTokens += tTokens;
        if (!globalTokenStats.stages[stage]) {
          globalTokenStats.stages[stage] = { promptTokens: 0, completionTokens: 0, calls: 0 };
        }
        globalTokenStats.stages[stage].promptTokens += pTokens;
        globalTokenStats.stages[stage].completionTokens += cTokens;
        globalTokenStats.stages[stage].calls += 1;
      }
      globalTokenStats.calls += 1;

      const content = payload.choices?.[0]?.message?.content;

      if (typeof content !== "string") {
        throw new LlmError(
          "LLM response did not contain text content.",
          "EMPTY_MODEL_RESPONSE",
        );
      }

      let parsedJson: unknown;
      try {
        parsedJson = extractJson(content);
      } catch (err) {
        if (options?.schema && attempt < MAX_ATTEMPTS) {
          console.warn(
            `[LLM Client][Stage: ${stage}][Attempt ${attempt}/${MAX_ATTEMPTS}] Failed to extract JSON from completion. Retrying with fallback prompting...`,
          );
          correctiveFeedback =
            "CRITICAL: Your previous output was not valid JSON. You must return ONLY raw valid JSON starting with '{' and ending with '}'.";
          useJsonObjectMode = false;
          await sleep(parseRetryDelay(undefined, undefined, attempt));
          continue;
        }
        throw err;
      }

      if (options?.schema) {
        const schemaResult = options.schema.safeParse(parsedJson);
        if (!schemaResult.success) {
          const issueSummary = schemaResult.error.issues
            .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
            .join("; ");

          console.warn(
            `[LLM Client][Stage: ${stage}][Attempt ${attempt}/${MAX_ATTEMPTS}] Schema validation failed: ${issueSummary}`,
          );

          if (attempt < MAX_ATTEMPTS) {
            correctiveFeedback = `CRITICAL: Your previous output failed schema validation: ${issueSummary}. Return a valid JSON object strictly adhering to the schema.`;
            useJsonObjectMode = false;
            await sleep(parseRetryDelay(undefined, undefined, attempt));
            continue;
          }

          throw new LlmError(
            `The model output failed schema validation: ${issueSummary}`,
            "SCHEMA_VALIDATION_FAILED",
            false,
          );
        }

        return schemaResult.data;
      }

      return parsedJson as T;
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

    const isRateLimit = response.status === 429;
    const isJsonValidationFailure =
      response.status === 400 &&
      (providerError.code === "json_validate_failed" ||
        providerError.message?.toLowerCase().includes("failed to validate json"));

    globalTokenStats.retries += 1;
    if (isRateLimit) {
      globalTokenStats.rateLimitErrors += 1;
    }

    console.error(
      `[LLM Client][Stage: ${stage}][Attempt ${attempt}/${MAX_ATTEMPTS}] Provider returned HTTP ${response.status}:`,
      JSON.stringify({
        type: providerError.type,
        code: providerError.code,
        message: providerError.message,
        failed_generation_preview: providerError.failedGeneration
          ? providerError.failedGeneration.slice(0, 200)
          : undefined,
      }),
    );

    const retryable =
      isRateLimit || response.status >= 500 || isJsonValidationFailure;

    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new LlmError(
        isRateLimit
          ? "The AI provider's rate limit was exceeded. Please try again in a moment."
          : `LLM provider returned HTTP ${response.status}.`,
        isRateLimit ? "LLM_RATE_LIMIT" : "LLM_HTTP_ERROR",
        retryable,
        providerError.message,
      );
    }

    if (isJsonValidationFailure) {
      console.warn(
        `[LLM Client][Stage: ${stage}] Provider rejected response_format: json_object (${providerError.code}). Falling back to raw JSON prompt on attempt ${attempt + 1}...`,
      );
      useJsonObjectMode = false;
      correctiveFeedback =
        "Return only a valid JSON object without markdown fences or conversational text.";
    }

    const delay = parseRetryDelay(response, providerError.message, attempt);
    if (isRateLimit) {
      console.warn(
        `[LLM Client][Stage: ${stage}] Rate limit encountered (429). Retrying after ${delay}ms delay (attempt ${attempt}/${MAX_ATTEMPTS})...`,
      );
    }
    await sleep(delay);
  }

  throw new LlmError("LLM request attempts exhausted.", "LLM_RETRIES_EXHAUSTED");
}

export async function generateStructuredJson<T = unknown>(
  prompt: string,
  options?: GenerateOptions<T>,
): Promise<T> {
  return enqueueRequest(() => executeGenerateStructuredJson<T>(prompt, options));
}
