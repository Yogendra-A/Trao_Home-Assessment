
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the pipeline before importing the route
vi.mock("../../server/src/pipeline/run", () => ({
  runInterviewPrepPipeline: vi.fn(),
}));

// Mock dotenv/config (loaded by chat-completions)
vi.mock("dotenv/config", () => ({}));

import { runInterviewPrepPipeline } from "../../server/src/pipeline/run";
import { UrlPolicyError } from "../../server/src/pipeline/research/url-policy";
import { LlmError } from "../../server/src/pipeline/llm/chat-completions";

// We test the route handler directly without spinning up Next.js
// by importing it as a regular module.
import { POST } from "../../src/app/api/kit/route";

// A minimal valid kit for mock responses
const validKit = {
  source: {
    company: "Example",
    company_url: "https://example.com",
    role: "Software Engineer",
    location: "Remote",
    jd_chars: 50,
    researched_at: new Date().toISOString(),
    pages_used: ["https://example.com/about"],
  },
  company_brief: {
    summary: "A technology company.",
    what_they_do: "Builds software products.",
    sources: ["https://example.com/about"],
  },
  role: {
    title: "Software Engineer",
    seniority: "Mid-level",
    responsibilities: ["Write code"],
    requirements: [
      { id: "r1", text: "Python", kind: "technical" as const, priority: "must" as const },
    ],
  },
  questions: [
    {
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical" as const,
      prompt: "Describe Python async/await.",
      answer_outline: "Event loop, coroutines, awaitables.",
      difficulty: 2,
    },
  ],
  flashcards: [
    {
      id: "fc_r1",
      front: "How would you demonstrate: Python?",
      back: "Prepare a specific explanation, relevant example, your approach, and the outcome.",
      requirement_ids: ["r1"],
    },
  ],
  schedule: {
    days_available: 3,
    days: [
      { day: 1, focus: "Python", question_ids: ["q1"], minutes: 25 },
      { day: 2, focus: "Review", question_ids: [], minutes: 0 },
      { day: 3, focus: "Review", question_ids: [], minutes: 0 },
    ],
  },
  coverage: {
    uncovered_requirement_ids: [],
    passes: 1,
  },
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/kit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/kit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with a valid kit for correct inputs", async () => {
    vi.mocked(runInterviewPrepPipeline).mockResolvedValue(validKit as never);

    const req = makeRequest({
      jd: "We need a Python developer.",
      company_url: "https://example.com",
      days: 3,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source.company).toBe("Example");
  });

  it("returns 422 when job description is missing", async () => {
    const req = makeRequest({ company_url: "https://example.com", days: 7 });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when days is out of range", async () => {
    const req = makeRequest({
      jd: "Engineer role.",
      company_url: "https://example.com",
      days: 0,
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("returns 422 when URL policy rejects the URL", async () => {
    vi.mocked(runInterviewPrepPipeline).mockRejectedValue(
      new UrlPolicyError("Localhost URLs are not allowed."),
    );

    const req = makeRequest({
      jd: "Engineer role.",
      company_url: "http://localhost",
      days: 3,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("URL_REJECTED");
    expect(body.error).toContain("Localhost URLs");
  });

  it("returns 500 when the pipeline throws a generic error", async () => {
    vi.mocked(runInterviewPrepPipeline).mockRejectedValue(
      new Error("Unexpected internal failure"),
    );

    const req = makeRequest({
      jd: "Engineer role.",
      company_url: "https://example.com",
      days: 3,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("PIPELINE_ERROR");
    // Should not expose raw internal messages to the client
    expect(body.error).not.toContain("Unexpected internal failure");
  });

  it("returns 422 when coverage validation fails", async () => {
    vi.mocked(runInterviewPrepPipeline).mockRejectedValue(
      new Error("Cannot finalize kit: uncovered must-have requirements: r1"),
    );

    const req = makeRequest({
      jd: "Engineer role.",
      company_url: "https://example.com",
      days: 3,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("Cannot finalize kit");
  });

  it("returns 400 for a malformed JSON body", async () => {
    const req = new Request("http://localhost/api/kit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is not json }",
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("handles provider HTTP 400 error safely without leaking sensitive details", async () => {
    vi.mocked(runInterviewPrepPipeline).mockRejectedValue(
      new LlmError("LLM provider returned HTTP 400.", "LLM_HTTP_ERROR", false),
    );

    const req = makeRequest({
      jd: "Software Engineer",
      company_url: "https://example.com",
      days: 5,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("LLM_HTTP_ERROR");
    expect(body.error).toBe("LLM provider returned HTTP 400.");
  });

  it("handles provider rate limit (429) with user-friendly retry message", async () => {
    vi.mocked(runInterviewPrepPipeline).mockRejectedValue(
      new LlmError("Rate limit exceeded", "LLM_RATE_LIMIT", true),
    );

    const req = makeRequest({
      jd: "Software Engineer",
      company_url: "https://example.com",
      days: 5,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("LLM_RATE_LIMIT");
    expect(body.error).toBe(
      "The AI provider is temporarily unavailable. Please try again in a moment.",
    );
  });
});
