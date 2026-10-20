
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateStructuredJson,
  LlmError,
  resetRequestQueue,
} from "../src/pipeline/llm/chat-completions";

afterEach(() => {
  resetRequestQueue();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("generateStructuredJson", () => {
  it("fails clearly when configuration is missing", async () => {
    vi.stubEnv("LLM_BASE_URL", "");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("LLM_MODEL", "");

    await expect(generateStructuredJson("test")).rejects.toMatchObject({
      code: "LLM_NOT_CONFIGURED",
    });
  });

  it("parses valid JSON from a successful response", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"requirements":[]}' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(generateStructuredJson("test")).resolves.toEqual({
      requirements: [],
    });
  });

  it("rejects malformed JSON", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "not json" } }],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(generateStructuredJson("test")).rejects.toMatchObject({
      code: "INVALID_MODEL_JSON",
    });
  });

  it("does not retry a non-retryable client error", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await expect(generateStructuredJson("test")).rejects.toBeInstanceOf(LlmError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("handles provider HTTP 400 error and logs sanitized error without secrets", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "super-secret-key-12345");
    vi.stubEnv("LLM_MODEL", "test-model");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const providerErrorBody = JSON.stringify({
      error: {
        message: "Invalid parameter with secret super-secret-key-12345",
        type: "invalid_request_error",
        code: "invalid_parameter",
      },
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(providerErrorBody, { status: 400, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await expect(generateStructuredJson("test")).rejects.toMatchObject({
      message: "LLM provider returned HTTP 400.",
      code: "LLM_HTTP_ERROR",
      retryable: false,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
    const loggedOutput = consoleSpy.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(loggedOutput).not.toContain("super-secret-key-12345");
    expect(loggedOutput).toContain("[REDACTED]");
    expect(loggedOutput).toContain("invalid_request_error");
    consoleSpy.mockRestore();
  });

  it("retries when provider returns HTTP 400 json_validate_failed and recovers", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Failed to validate JSON. Please adjust your prompt.",
              type: "invalid_request_error",
              code: "json_validate_failed",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"recovered": true}' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", mockFetch);

    const result = await generateStructuredJson("test");
    expect(result).toEqual({ recovered: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it("throws after exhausting retries when json_validate_failed persists", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: "Failed to validate JSON. Please adjust your prompt.",
              type: "invalid_request_error",
              code: "json_validate_failed",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    vi.stubGlobal("fetch", mockFetch);

    await expect(generateStructuredJson("test")).rejects.toMatchObject({
      message: "LLM provider returned HTTP 400.",
      code: "LLM_HTTP_ERROR",
      retryable: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    consoleSpy.mockRestore();
  });
});

describe("redactSecrets and extractProviderError helpers", () => {
  it("redacts API keys and Bearer tokens from error strings", async () => {
    const { redactSecrets, extractProviderError } = await import(
      "../src/pipeline/llm/chat-completions"
    );

    const raw = "Error with key secret-123 and Bearer abcdef123456 and gsk_test1234567890";
    const redacted = redactSecrets(raw, "secret-123");
    expect(redacted).not.toContain("secret-123");
    expect(redacted).not.toContain("Bearer abcdef123456");
    expect(redacted).not.toContain("gsk_test1234567890");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).toContain("Bearer [REDACTED]");
    expect(redacted).toContain("[REDACTED_KEY]");

    const extracted = extractProviderError(
      400,
      JSON.stringify({
        error: {
          message: "Failed token Bearer secret-tok and key secret-123",
          type: "auth_error",
          code: "token_invalid",
        },
      }),
      "secret-123",
    );

    expect(extracted.type).toBe("auth_error");
    expect(extracted.code).toBe("token_invalid");
    expect(extracted.message).not.toContain("secret-123");
    expect(extracted.message).not.toContain("secret-tok");
  });
});

describe("parseRetryDelay", () => {
  it("parses numeric retry-after header", async () => {
    const { parseRetryDelay } = await import("../src/pipeline/llm/chat-completions");
    const res = new Response("", { headers: { "retry-after": "5" } });
    const delay = parseRetryDelay(res, undefined, 1);
    expect(delay).toBe(5300); // 5000 + 300ms buffer
  });

  it("parses x-ratelimit-reset-tokens header", async () => {
    const { parseRetryDelay } = await import("../src/pipeline/llm/chat-completions");
    const res = new Response("", { headers: { "x-ratelimit-reset-tokens": "9.285s" } });
    const delay = parseRetryDelay(res, undefined, 1);
    expect(delay).toBe(9585); // 9285 + 300ms
  });

  it("parses seconds from error message text", async () => {
    const { parseRetryDelay } = await import("../src/pipeline/llm/chat-completions");
    const msg = "Rate limit reached on TPM: Limit 8000, Used 6752. Please try again in 9.285s. Need more tokens?";
    const delay = parseRetryDelay(undefined, msg, 1);
    expect(delay).toBe(9585);
  });

  it("parses milliseconds from error message text", async () => {
    const { parseRetryDelay } = await import("../src/pipeline/llm/chat-completions");
    const msg = "Please try again in 500ms.";
    const delay = parseRetryDelay(undefined, msg, 1);
    expect(delay).toBe(800);
  });

  it("caps maximum delay at 15000ms", async () => {
    const { parseRetryDelay } = await import("../src/pipeline/llm/chat-completions");
    const msg = "Please try again in 1m30s.";
    const delay = parseRetryDelay(undefined, msg, 1);
    expect(delay).toBe(15000);
  });

  it("falls back to bounded exponential backoff when no delay info is present", async () => {
    const { parseRetryDelay } = await import("../src/pipeline/llm/chat-completions");
    expect(parseRetryDelay(undefined, undefined, 1)).toBe(1000);
    expect(parseRetryDelay(undefined, undefined, 2)).toBe(2000);
    expect(parseRetryDelay(undefined, undefined, 3)).toBe(4000);
  });
});

describe("429 rate limiting and request queue", () => {
  it("retries on HTTP 429 with parsed retry delay and recovers on next attempt", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Rate limit reached. Please try again in 50ms.",
              type: "tokens",
              code: "rate_limit_exceeded",
            },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok": true}' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", mockFetch);

    const result = await generateStructuredJson("test prompt");
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify max_completion_tokens was passed
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.max_completion_tokens).toBe(1500);

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("throws LLM_RATE_LIMIT error when 429 retries are exhausted", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: "Rate limit reached. Please try again in 10ms.",
              type: "tokens",
              code: "rate_limit_exceeded",
            },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    vi.stubGlobal("fetch", mockFetch);

    await expect(generateStructuredJson("test prompt")).rejects.toMatchObject({
      message: "The AI provider's rate limit was exceeded. Please try again in a moment.",
      code: "LLM_RATE_LIMIT",
      retryable: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("serializes concurrent requests through FIFO queue", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    let inFlight = 0;
    let maxInFlight = 0;

    const mockFetch = vi.fn().mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight--;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"status":"ok"}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    vi.stubGlobal("fetch", mockFetch);

    await Promise.all([
      generateStructuredJson("call 1"),
      generateStructuredJson("call 2"),
      generateStructuredJson("call 3"),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1); // Never more than 1 in flight simultaneously
  });
});
