import { describe, expect, it } from "vitest";
import { allocateSchedule } from "../src/pipeline/generation/schedule";
import type { Question, Requirement } from "../../shared/schemas/kit";

const requirements: Requirement[] = [
  { id: "r1", text: "Python", kind: "technical", priority: "must" },
  { id: "r2", text: "Communication", kind: "behavioural", priority: "must" },
];

const questions: Question[] = [
  {
    id: "q1",
    requirement_ids: ["r1"],
    category: "technical",
    prompt: "Explain Python dictionaries.",
    answer_outline: "Key-value mappings.",
    difficulty: 3,
  },
  {
    id: "q2",
    requirement_ids: ["r2"],
    category: "behavioural",
    prompt: "Describe a team conflict.",
    answer_outline: "Situation, action, result.",
    difficulty: 1,
  },
];

describe("allocateSchedule", () => {
  it("creates exactly the requested number of days", () => {
    const schedule = allocateSchedule({
      daysAvailable: 3,
      requirements,
      questions,
    });

    expect(schedule.days_available).toBe(3);
    expect(schedule.days).toHaveLength(3);
    expect(schedule.days.map((day) => day.day)).toEqual([1, 2, 3]);
  });

  it("schedules every question exactly once", () => {
    const schedule = allocateSchedule({
      daysAvailable: 2,
      requirements,
      questions,
    });

    const scheduledIds = schedule.days.flatMap((day) => day.question_ids);

    expect(scheduledIds.sort()).toEqual(["q1", "q2"]);
  });

  it("uses integer minutes and includes all must-have requirements", () => {
    const schedule = allocateSchedule({
      daysAvailable: 2,
      requirements,
      questions,
    });

    expect(
      schedule.days.every((day) => Number.isInteger(day.minutes)),
    ).toBe(true);

    const scheduledIds = new Set(schedule.days.flatMap((day) => day.question_ids));
    const coveredIds = new Set(
      questions
        .filter((question) => scheduledIds.has(question.id))
        .flatMap((question) => question.requirement_ids),
    );

    expect(coveredIds.has("r1")).toBe(true);
    expect(coveredIds.has("r2")).toBe(true);
  });

  it("places harder and higher-priority material on earlier days", () => {
    const mixedRequirements: Requirement[] = [
      { id: "r1", text: "React", kind: "technical", priority: "must" },
      { id: "r2", text: "Nice CSS", kind: "technical", priority: "nice" },
    ];

    const mixedQuestions: Question[] = [
      {
        id: "q_nice_easy",
        requirement_ids: ["r2"],
        category: "technical",
        prompt: "CSS question",
        answer_outline: "Answer",
        difficulty: 1,
      },
      {
        id: "q_must_hard",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "React concurrency",
        answer_outline: "Answer",
        difficulty: 3,
      },
    ];

    const schedule = allocateSchedule({
      daysAvailable: 2,
      requirements: mixedRequirements,
      questions: mixedQuestions,
    });

    expect(schedule.days[0].question_ids).toContain("q_must_hard");
    expect(schedule.days[1].question_ids).toContain("q_nice_easy");
  });

  it("rejects an invalid number of days", () => {
    expect(() =>
      allocateSchedule({
        daysAvailable: 0,
        requirements,
        questions,
      }),
    ).toThrow(/integer between 1 and 60/);
  });

  it("rejects uncovered must-have requirements", () => {
    expect(() =>
      allocateSchedule({
        daysAvailable: 2,
        requirements,
        questions: [questions[0]],
      }),
    ).toThrow(/uncovered must-have requirements/);
  });
});
