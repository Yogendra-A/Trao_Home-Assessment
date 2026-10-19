
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateStructuredJson, LlmError } from "../src/pipeline/llm/chat-completions";

afterEach(() => {
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
});
