
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateStructuredJson, resetRequestQueue } from "../src/pipeline/llm/chat-completions";
import {
  buildRequirementsPrompt,
  extractRequirements,
  RequirementsResponseSchema,
} from "../src/pipeline/requirements/extract";

afterEach(() => {
  resetRequestQueue();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("extractRequirements", () => {
  it("builds a prompt that preserves must/nice distinctions", () => {
    const prompt = buildRequirementsPrompt(
      "Required: Python. Bonus: experience with Docker.",
    );

    expect(prompt).toContain("must");
    expect(prompt).toContain("nice");
    expect(prompt).toContain("Required: Python");
  });

  it("validates, deduplicates and assigns stable IDs", async () => {
    const generate = vi.fn().mockResolvedValue({
      requirements: [
        { text: "Python programming", kind: "technical", priority: "must" },
        { text: "Python programming", kind: "technical", priority: "must" },
        { text: "Clear communication", kind: "behavioural", priority: "nice" },
      ],
    });

    const first = await extractRequirements("Python is required.", generate);
    const second = await extractRequirements("Python is required.", generate);

    expect(first).toHaveLength(2);
    expect(first[0].id).toMatch(/^r_[a-f0-9]{12}$/);
    expect(first[0].id).toBe(second[0].id);
  });

  it("rejects malformed model output", async () => {
    const generate = vi.fn().mockResolvedValue({
      requirements: [
        { text: "Python", kind: "unknown", priority: "must" },
      ],
    });

    await expect(
      extractRequirements("Python is required.", generate),
    ).rejects.toThrow();
  });

  it("rejects an empty job description", async () => {
    const generate = vi.fn();

    await expect(extractRequirements("  ", generate)).rejects.toThrow(
      /cannot be empty/i,
    );

    expect(generate).not.toHaveBeenCalled();
  });

  it("handles markdown code block responses from the generator", async () => {
    const generate = vi.fn().mockResolvedValue({
      requirements: [
        { text: "TypeScript experience", kind: "technical", priority: "must" },
        { text: "Agile methodologies", kind: "domain", priority: "nice" },
      ],
    });

    const result = await extractRequirements(
      "Looking for TypeScript and Agile experience.",
      generate,
    );

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("TypeScript experience");
    expect(result[0].kind).toBe("technical");
    expect(result[0].priority).toBe("must");
    expect(result[1].text).toBe("Agile methodologies");
    expect(result[1].kind).toBe("domain");
    expect(result[1].priority).toBe("nice");
  });

  it("rejects output violating RequirementsResponseSchema with invalid priority or kind", async () => {
    const invalidPriority = vi.fn().mockResolvedValue({
      requirements: [
        { text: "Python", kind: "technical", priority: "critical" }, // "critical" is invalid
      ],
    });

    await expect(
      extractRequirements("Python required.", invalidPriority),
    ).rejects.toThrow();

    const invalidKind = vi.fn().mockResolvedValue({
      requirements: [
        { text: "Python", kind: "software", priority: "must" }, // "software" is invalid
      ],
    });

    await expect(
      extractRequirements("Python required.", invalidKind),
    ).rejects.toThrow();
  });

  it("preserves ExtractedRequirement contract and stable deterministic hash IDs", async () => {
    const generate = vi.fn().mockResolvedValue({
      requirements: [
        { text: "Node.js backend development", kind: "technical", priority: "must" },
      ],
    });

    const result1 = await extractRequirements("Node.js needed", generate);
    const result2 = await extractRequirements("Node.js needed", generate);

    expect(result1).toHaveLength(1);
    expect(result1[0]).toMatchObject({
      text: "Node.js backend development",
      kind: "technical",
      priority: "must",
    });
    expect(result1[0].id).toMatch(/^r_[a-f0-9]{12}$/);
    expect(result1[0].id).toBe(result2[0].id);
  });
});

describe("extractRequirements end-to-end with generateStructuredJson", () => {
  it("extracts requirements successfully with valid structured model JSON", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "openai/gpt-oss-20b");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  requirements: [
                    { text: "Python and Django", kind: "technical", priority: "must" },
                    { text: "Communication skills", kind: "behavioural", priority: "nice" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    vi.stubGlobal("fetch", mockFetch);

    const result = await extractRequirements(
      "Must have Python and Django. Nice to have good communication.",
      generateStructuredJson,
    );

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Python and Django");
    expect(result[0].kind).toBe("technical");
    expect(result[0].priority).toBe("must");
    expect(result[0].id).toMatch(/^r_[a-f0-9]{12}$/);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify max_completion_tokens is 1800 (sufficient for reasoning models)
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.max_completion_tokens).toBe(1800);
  });

  it("recovers and extracts requirements when provider fails with HTTP 400 json_validate_failed", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "openai/gpt-oss-20b");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
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
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    requirements: [
                      { text: "Kubernetes orchestration", kind: "technical", priority: "must" },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", mockFetch);

    const result = await extractRequirements(
      "Need Kubernetes experience.",
      generateStructuredJson,
    );

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Kubernetes orchestration");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify second attempt scaled tokens and dropped response_format
    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondCallBody.response_format).toBeUndefined();
    expect(secondCallBody.max_completion_tokens).toBe(2700);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("recovers when model response is wrapped in Markdown code fences", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "openai/gpt-oss-20b");

    const fencedContent =
      'Here are the requirements:\n```json\n{\n  "requirements": [\n    {"text": "PostgreSQL", "kind": "technical", "priority": "must"}\n  ]\n}\n```\nAll done.';

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: fencedContent } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    vi.stubGlobal("fetch", mockFetch);

    const result = await extractRequirements("PostgreSQL required", generateStructuredJson);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("PostgreSQL");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("recovers from truncated JSON when model hits token limit mid-generation", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "openai/gpt-oss-20b");

    const truncated =
      '{"requirements": [{"text": "Golang microservices", "kind": "technical", "priority": "must"}, {"text": "GCP cl';

    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: truncated }, finish_reason: "length" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    vi.stubGlobal("fetch", mockFetch);

    const result = await extractRequirements("Golang microservices", generateStructuredJson);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Golang microservices");
    expect(result[0].id).toMatch(/^r_[a-f0-9]{12}$/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries on persistent provider HTTP error without leaking secrets", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://llm.example/v1");
    vi.stubEnv("LLM_API_KEY", "gsk_secret_production_key_abcdef12345");
    vi.stubEnv("LLM_MODEL", "openai/gpt-oss-20b");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: "Failed with key gsk_secret_production_key_abcdef12345",
              type: "invalid_request_error",
              code: "json_validate_failed",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    vi.stubGlobal("fetch", mockFetch);

    await expect(
      extractRequirements("Job description", generateStructuredJson),
    ).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Ensure secret was redacted from logged errors
    const logged = errorSpy.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(logged).not.toContain("gsk_secret_production_key_abcdef12345");
    expect(logged).toContain("[REDACTED_KEY]");

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
