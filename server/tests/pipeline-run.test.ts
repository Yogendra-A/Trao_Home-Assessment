
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/pipeline/research/research-company", () => ({
  researchCompany: vi.fn(),
}));

vi.mock("../src/pipeline/requirements/generate-requirements", () => ({
  generateRequirements: vi.fn(),
}));

vi.mock("../src/pipeline/questions/coverage-loop", () => ({
  generateWithCoverage: vi.fn(),
  assertMustHaveCoverage: vi.fn(),
}));

vi.mock("../src/pipeline/llm/chat-completions", () => ({
  generateStructuredJson: vi.fn(),
}));

import { researchCompany } from "../src/pipeline/research/research-company";
import { generateRequirements } from "../src/pipeline/requirements/generate-requirements";
import {
  generateWithCoverage,
  assertMustHaveCoverage,
} from "../src/pipeline/questions/coverage-loop";
import { generateStructuredJson } from "../src/pipeline/llm/chat-completions";
import { runInterviewPrepPipeline } from "../src/pipeline/run";

const input = {
  jd: "We require Python programming and API development.",
  company_url: "https://example.com",
  days: 3,
};

const requirement = {
  id: "r_python",
  text: "Python programming",
  kind: "technical" as const,
  priority: "must" as const,
};

const question = {
  id: "q_python",
  requirement_ids: ["r_python"],
  category: "technical" as const,
  prompt: "How would you use Python to build an API?",
  answer_outline: "Discuss routing, validation, testing, and error handling.",
  difficulty: 2,
};

describe("runInterviewPrepPipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(researchCompany).mockResolvedValue({
      companyUrl: "https://example.com/",
      evidence: [
        {
          url: "https://example.com/about",
          title: "About",
          text: "Example company overview.",
          relevance: 5,
        },
      ],
      sourcesFetched: 1,
      skipped: [],
      findings: {
        companyOverviewSources: [],
        hiringProcessSources: [],
        engineeringSources: [],
      },
    });

    vi.mocked(generateRequirements).mockResolvedValue([requirement]);

    vi.mocked(generateWithCoverage).mockResolvedValue({
      questions: [question],
      uncoveredRequirementIds: [],
      passes: 1,
    });

    vi.mocked(generateStructuredJson).mockImplementation(async (prompt) => {
      if (prompt.includes("Summarize the company")) {
        return {
          summary: "A company overview based on supplied evidence.",
          what_they_do: "Their activities require further verification.",
        };
      }

      return {
        title: "Software Engineer",
        seniority: "Entry-level",
        location: "Not specified",
        responsibilities: ["Develop and maintain APIs"],
      };
    });
  });

  it("builds a schema-valid interview kit", async () => {
    const kit = await runInterviewPrepPipeline(input);

    expect(kit.source.company).toBe("Example");
    expect(kit.role.requirements).toEqual([requirement]);
    expect(kit.questions).toEqual([question]);
    expect(kit.schedule.days_available).toBe(3);
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.coverage.passes).toBe(1);
    expect(kit.flashcards).toHaveLength(1);
    expect(kit.schedule.days).toHaveLength(3);

    expect(researchCompany).toHaveBeenCalledWith(
      "https://example.com/",
    );
    expect(generateRequirements).toHaveBeenCalledWith(input.jd);
    expect(assertMustHaveCoverage).toHaveBeenCalledOnce();
  });

  it("rejects an empty job description", async () => {
    await expect(
      runInterviewPrepPipeline({ ...input, jd: "   " }),
    ).rejects.toThrow("Job description cannot be empty.");

    expect(researchCompany).not.toHaveBeenCalled();
  });

  it("rejects an invalid preparation duration", async () => {
    await expect(
      runInterviewPrepPipeline({ ...input, days: 0 }),
    ).rejects.toThrow("days must be an integer between 1 and 60.");
  });

  it("rejects unsupported URL protocols", async () => {
    await expect(
      runInterviewPrepPipeline({
        ...input,
        company_url: "file:///etc/passwd",
      }),
    ).rejects.toThrow("Company URL must use HTTP or HTTPS.");

    expect(researchCompany).not.toHaveBeenCalled();
  });

  it("stops if no requirements are extracted", async () => {
    vi.mocked(generateRequirements).mockResolvedValue([]);

    await expect(
      runInterviewPrepPipeline(input),
    ).rejects.toThrow(
      "No interview requirements could be extracted from the job description.",
    );

    expect(generateWithCoverage).not.toHaveBeenCalled();
  });

  it("rejects uncovered must-have requirements", async () => {
    vi.mocked(assertMustHaveCoverage).mockImplementation(() => {
      throw new Error(
        "Cannot finalize kit: uncovered must-have requirements: r_python",
      );
    });

    await expect(
      runInterviewPrepPipeline(input),
    ).rejects.toThrow("uncovered must-have requirements: r_python");
  });

  it("bounds evidence and JD size to minimize token consumption", async () => {
    vi.mocked(researchCompany).mockResolvedValue({
      companyUrl: "https://example.com/",
      evidence: Array.from({ length: 10 }, (_, i) => ({
        url: `https://example.com/page-${i}`,
        title: `Page ${i}`,
        text: "x".repeat(3000),
        relevance: 5,
      })),
      sourcesFetched: 10,
      skipped: [],
      findings: {
        companyOverviewSources: [],
        hiringProcessSources: [],
        engineeringSources: [],
      },
    });

    const longJd = "Role details.\n" + "Extra boilerplate.\n".repeat(500);
    await runInterviewPrepPipeline({ ...input, jd: longJd });

    expect(generateStructuredJson).toHaveBeenCalledTimes(2);

    const [briefPrompt, rolePrompt] = vi.mocked(generateStructuredJson).mock.calls.map(
      (c) => c[0],
    );

    // Verify brief prompt bounded evidence items (at most 4) and text slice (at most 600)
    expect(briefPrompt).toContain("WEBSITE EVIDENCE:");
    expect(briefPrompt.length).toBeLessThan(4000);

    // Verify role prompt truncated JD length
    expect(rolePrompt).toContain("JOB DESCRIPTION:");
    expect(rolePrompt.length).toBeLessThan(5000);
  });
});
