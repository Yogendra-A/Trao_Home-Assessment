import { describe, expect, it, vi } from "vitest";
import type { ExtractedRequirement } from "../src/pipeline/requirements/extract";
import {
  generateQuestions,
  filterRequirementsForCategory,
  type QuestionGenerator,
} from "../src/pipeline/questions/generate";
import {
  assertMustHaveCoverage,
  findUncoveredRequirements,
  generateWithCoverage,
} from "../src/pipeline/questions/coverage-loop";

const requirements: ExtractedRequirement[] = [
  {
    id: "r_python",
    text: "Python programming",
    kind: "technical",
    priority: "must",
  },
  {
    id: "r_teamwork",
    text: "Team collaboration",
    kind: "behavioural",
    priority: "must",
  },
];

type Category =
  | "technical"
  | "behavioural"
  | "system-design"
  | "company-fit";

function getCategory(prompt: string): Category {
  const match = prompt.match(/CATEGORY: ([\w-]+)/);

  if (!match) {
    throw new Error("Prompt is missing its question category.");
  }

  return match[1] as Category;
}

function responseFor(category: Category, requirementId: string) {
  return {
    questions: [
      {
        requirement_ids: [requirementId],
        category,
        prompt: `${category} question for ${requirementId}`,
        answer_outline: "Explain the approach and give a relevant example.",
        difficulty: 2,
      },
    ],
  };
}

describe("question generation and coverage", () => {
  it("generates separate category calls with valid requirement references", async () => {
    const generate: QuestionGenerator = vi.fn(async (prompt) => {
      const category = getCategory(prompt);

      if (category === "technical") {
        return responseFor("technical", "r_python");
      }

      return { questions: [] };
    });

    const questions = await generateQuestions([requirements[0]], generate);

    expect(generate).toHaveBeenCalledTimes(4);
    expect(questions).toHaveLength(1);
    expect(questions[0].requirement_ids).toEqual(["r_python"]);
    expect(questions[0].category).toBe("technical");
  });

  it("rejects unknown requirement IDs", async () => {
    const generate: QuestionGenerator = vi.fn(async (prompt) => {
      const category = getCategory(prompt);

      if (category === "technical") {
        return responseFor("technical", "unknown");
      }

      return { questions: [] };
    });

    await expect(
      generateQuestions([requirements[0]], generate),
    ).rejects.toThrow(/unknown requirement ID/i);
  });

  it("detects uncovered requirements deterministically", () => {
    const questions = [
      {
        id: "q1",
        requirement_ids: ["r_python"],
        category: "technical" as const,
        prompt: "Explain Python.",
        answer_outline: "Discuss examples.",
        difficulty: 1,
      },
    ];

    expect(findUncoveredRequirements(requirements, questions)).toEqual([
      "r_teamwork",
    ]);
  });

  it("uses the second pass to generate a missing question", async () => {
    let technicalCalls = 0;

    const generate: QuestionGenerator = vi.fn(async (prompt) => {
      const category = getCategory(prompt);

      if (category === "technical") {
        technicalCalls += 1;

        // First pass: cover Python.
        if (technicalCalls === 1) {
          return responseFor("technical", "r_python");
        }

        // Second pass: cover the remaining teamwork requirement.
        if (technicalCalls === 2) {
          return responseFor("technical", "r_teamwork");
        }
      }

      return { questions: [] };
    });

    const result = await generateWithCoverage(requirements, generate, 2);

    expect(result.passes).toBe(2);
    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.questions).toHaveLength(2);
    expect(
      result.questions.flatMap((question) => question.requirement_ids),
    ).toContain("r_python");
    expect(
      result.questions.flatMap((question) => question.requirement_ids),
    ).toContain("r_teamwork");
  });

  it("refuses to finalize when a must-have remains uncovered", () => {
    const result = {
      questions: [],
      uncoveredRequirementIds: ["r_python"],
      passes: 2,
    };

    expect(() => assertMustHaveCoverage(requirements, result)).toThrow(
      /uncovered must-have/i,
    );
  });

  it("filters requirements by category to avoid redundant input tokens", () => {
    const mixedRequirements: ExtractedRequirement[] = [
      { id: "r_tech", text: "React and Node.js", kind: "technical", priority: "must" },
      { id: "r_beh", text: "Cross-functional communication", kind: "behavioural", priority: "nice" },
      { id: "r_dom", text: "FinTech compliance", kind: "domain", priority: "must" },
    ];

    const techFiltered = filterRequirementsForCategory(mixedRequirements, "technical");
    expect(techFiltered.some((r) => r.id === "r_tech")).toBe(true);
    expect(techFiltered.some((r) => r.id === "r_dom")).toBe(true);
    expect(techFiltered.some((r) => r.id === "r_beh")).toBe(false);

    const behFiltered = filterRequirementsForCategory(mixedRequirements, "behavioural");
    expect(behFiltered.some((r) => r.id === "r_beh")).toBe(true);
    expect(behFiltered.some((r) => r.id === "r_tech")).toBe(false);

    // Fallback when a category has no matching requirements
    const onlyTech: ExtractedRequirement[] = [
      { id: "r_tech", text: "Python", kind: "technical", priority: "must" },
    ];
    const behFallback = filterRequirementsForCategory(onlyTech, "behavioural");
    expect(behFallback).toHaveLength(1);
    expect(behFallback[0].id).toBe("r_tech");
  });
});
