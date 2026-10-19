
import { describe, expect, it } from "vitest";
import { checkCoverage } from "../src/pipeline/validation/coverage";
import type { Question, Requirement } from "../../shared/schemas/kit";

const requirements: Requirement[] = [
  { id: "r1", text: "Python", kind: "technical", priority: "must" },
  { id: "r2", text: "Communication", kind: "behavioural", priority: "must" },
  { id: "r3", text: "Docker", kind: "technical", priority: "nice" },
];

const questions: Question[] = [
  {
    id: "q1",
    requirement_ids: ["r1"],
    category: "technical",
    prompt: "Explain Python dictionaries.",
    answer_outline: "Key-value mappings.",
    difficulty: 1,
  },
  {
    id: "q2",
    requirement_ids: ["r2"],
    category: "behavioural",
    prompt: "Describe a team conflict.",
    answer_outline: "Situation, action, result.",
    difficulty: 2,
  },
];

describe("checkCoverage", () => {
  it("reports complete when all must-have requirements are covered", () => {
    const result = checkCoverage(requirements, questions);

    expect(result.uncovered_requirement_ids).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("reports uncovered must-have requirements", () => {
    const result = checkCoverage(requirements, [questions[0]]);

    expect(result.uncovered_requirement_ids).toEqual(["r2"]);
    expect(result.complete).toBe(false);
  });

  it("ignores uncovered nice-to-have requirements", () => {
    const result = checkCoverage(requirements, questions);

    expect(result.uncovered_requirement_ids).not.toContain("r3");
  });

  it("reports references to unknown requirement IDs", () => {
    const result = checkCoverage(requirements, [
      { ...questions[0], requirement_ids: ["unknown"] },
    ]);

    expect(result.invalid_requirement_references).toEqual(["unknown"]);
    expect(result.complete).toBe(false);
  });

  it("reports questions with no requirement references", () => {
    const result = checkCoverage(requirements, [
      { ...questions[0], requirement_ids: [] },
    ]);

    expect(result.questions_without_requirements).toEqual(["q1"]);
    expect(result.complete).toBe(false);
  });
});
