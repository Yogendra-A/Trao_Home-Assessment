
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


describe("Structured output resilience and schema validation", () => {
  it("drops response_format on retry when provider returns json_validate_failed and succeeds", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "openai/gpt-oss-20b");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
              type: "invalid_request_error",
              code: "json_validate_failed",
              failed_generation: '{"incomplete":',
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"success": true, "items": ["a", "b"]}' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", mockFetch);

    const result = await generateStructuredJson("Extract items", { stage: "test_stage" });
    expect(result).toEqual({ success: true, items: ["a", "b"] });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify first attempt sent response_format json_object
    const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(firstCallBody.response_format).toEqual({ type: "json_object" });

    // Verify second attempt dropped response_format as fallback
    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondCallBody.response_format).toBeUndefined();

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("extracts JSON embedded in conversational preamble or markdown code blocks", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Certainly! Here is the JSON you requested:\n```json\n{\n  "role": "Backend Engineer",\n  "skills": ["Go", "Kubernetes"]\n}\n```\nHope that helps!',
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    vi.stubGlobal("fetch", mockFetch);

    const result = await generateStructuredJson("Extract role");
    expect(result).toEqual({
      role: "Backend Engineer",
      skills: ["Go", "Kubernetes"],
    });
  });

  it("retries when response fails Zod schema validation and recovers on subsequent attempt", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    const { z } = await import("zod");
    const TargetSchema = z.object({
      name: z.string(),
      count: z.number().int(),
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockFetch = vi
      .fn()
      // First attempt returns wrong type (count as string)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"name": "test", "count": "not-a-number"}' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      // Second attempt returns corrected valid types
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"name": "test", "count": 42}' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", mockFetch);

    const result = await generateStructuredJson("Get count", {
      schema: TargetSchema,
      stage: "schema_test",
    });

    expect(result).toEqual({ name: "test", count: 42 });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify corrective feedback was appended to the second prompt
    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    const userMessage = secondCallBody.messages[1].content;
    expect(userMessage).toContain("CRITICAL: Your previous output failed schema validation");

    warnSpy.mockRestore();
  });

  it("throws SCHEMA_VALIDATION_FAILED after exhausting retries on persistent invalid schema", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");

    const { z } = await import("zod");
    const TargetSchema = z.object({
      requiredKey: z.string(),
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"wrongKey": 123}' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    vi.stubGlobal("fetch", mockFetch);

    await expect(
      generateStructuredJson("Get data", { schema: TargetSchema }),
    ).rejects.toMatchObject({
      code: "SCHEMA_VALIDATION_FAILED",
      retryable: false,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });
});

describe("Rate-Limit Scheduling and Token Budget Tracking", () => {
  it("tracks rate limit status from response headers", async () => {
    const { updateRateLimitFromHeaders, getRateLimitStatus, resetRateLimitStatus } = await import(
      "../src/pipeline/llm/chat-completions"
    );

    resetRateLimitStatus();
    const headers = new Headers({
      "x-ratelimit-limit-tokens": "8000",
      "x-ratelimit-remaining-tokens": "5200",
      "x-ratelimit-reset-tokens": "6.5s",
      "x-ratelimit-limit-requests": "30",
      "x-ratelimit-remaining-requests": "25",
    });

    updateRateLimitFromHeaders(headers);
    const status = getRateLimitStatus();

    expect(status.limitTokens).toBe(8000);
    expect(status.remainingTokens).toBe(5200);
    expect(status.resetTokensMs).toBe(6500);
    expect(status.remainingRequests).toBe(25);
  });

  it("accurately estimates input tokens from text", async () => {
    const { estimateInputTokens } = await import("../src/pipeline/llm/chat-completions");

    const sampleText = "Short prompt text.";
    const tokens = estimateInputTokens(sampleText);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.ceil(sampleText.length / 3.5));
  });

  it("adds bounded jitter when withJitter is requested", async () => {
    const { parseRetryDelay } = await import("../src/pipeline/llm/chat-completions");

    const withoutJitter = parseRetryDelay(undefined, undefined, 1, false);
    expect(withoutJitter).toBe(1000);

    const withJitter = parseRetryDelay(undefined, undefined, 1, true);
    expect(withJitter).toBeGreaterThanOrEqual(1050);
    expect(withJitter).toBeLessThanOrEqual(1350);
  });

  it("accumulates and resets token usage statistics", async () => {
    const { getTokenStats, resetTokenStats } = await import("../src/pipeline/llm/chat-completions");

    resetTokenStats();
    const initial = getTokenStats();
    expect(initial.totalTokens).toBe(0);
    expect(initial.calls).toBe(0);
  });
});
