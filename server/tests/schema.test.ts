import { describe, expect, it } from "vitest";
import { InterviewKitSchema } from "../../shared/schemas/kit";

const validKit = {
  source: {
    company: "Example Corp",
    company_url: "https://example.com",
    role: "Software Engineer",
    location: "Bengaluru",
    jd_chars: 120,
    researched_at: "2026-10-19T10:00:00.000Z",
    pages_used: ["https://example.com/about"],
  },
  company_brief: {
    summary: "A software company.",
    what_they_do: "Builds software products.",
    sources: ["https://example.com/about"],
  },
  role: {
    title: "Software Engineer",
    seniority: "Entry-level",
    responsibilities: ["Build and maintain software"],
    requirements: [
      {
        id: "r1",
        text: "Python programming",
        kind: "technical",
        priority: "must",
      },
    ],
  },
  questions: [
    {
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical",
      prompt: "Explain Python dictionaries.",
      answer_outline: "Key-value mappings and lookup behaviour.",
      difficulty: 2,
    },
  ],
  flashcards: [
    {
      id: "f1",
      front: "What is a Python dictionary?",
      back: "A mutable key-value mapping.",
      requirement_ids: ["r1"],
    },
  ],
  schedule: {
    days_available: 2,
    days: [
      {
        day: 1,
        focus: "Python fundamentals",
        question_ids: ["q1"],
        minutes: 35,
      },
      {
        day: 2,
        focus: "Review and practice",
        question_ids: [],
        minutes: 20,
      },
    ],
  },
  coverage: {
    uncovered_requirement_ids: [],
    passes: 2,
  },
};

describe("InterviewKitSchema", () => {
  it("accepts a valid kit", () => {
    expect(InterviewKitSchema.safeParse(validKit).success).toBe(true);
  });

  it("rejects a question with difficulty outside 1–3", () => {
    const invalidKit = {
      ...validKit,
      questions: [{ ...validKit.questions[0], difficulty: 4 }],
    };

    expect(InterviewKitSchema.safeParse(invalidKit).success).toBe(false);
  });

  it("rejects non-integer schedule durations", () => {
    const invalidKit = {
      ...validKit,
      schedule: {
        ...validKit.schedule,
        days: [
          { ...validKit.schedule.days[0], minutes: 12.5 },
          validKit.schedule.days[1],
        ],
      },
    };

    expect(InterviewKitSchema.safeParse(invalidKit).success).toBe(false);
  });

  it("rejects a schedule outside the supported day range", () => {
    const invalidKit = {
      ...validKit,
      schedule: { ...validKit.schedule, days_available: 61 },
    };

    expect(InterviewKitSchema.safeParse(invalidKit).success).toBe(false);
  });

  it("rejects a missing required section", () => {
    const { company_brief: _companyBrief, ...invalidKit } = validKit;

    expect(InterviewKitSchema.safeParse(invalidKit).success).toBe(false);
  });

  it("rejects schedule referencing a non-existent question ID", () => {
    const invalidKit = {
      ...validKit,
      schedule: {
        ...validKit.schedule,
        days: [
          {
            ...validKit.schedule.days[0],
            question_ids: ["q_does_not_exist"],
          },
          validKit.schedule.days[1],
        ],
      },
    };

    expect(InterviewKitSchema.safeParse(invalidKit).success).toBe(false);
  });

  it("rejects questions referencing a non-existent requirement ID", () => {
    const invalidKit = {
      ...validKit,
      questions: [
        {
          ...validKit.questions[0],
          requirement_ids: ["r_unknown"],
        },
      ],
    };

    expect(InterviewKitSchema.safeParse(invalidKit).success).toBe(false);
  });

  it("rejects duplicate requirement IDs", () => {
    const invalidKit = {
      ...validKit,
      role: {
        ...validKit.role,
        requirements: [
          { id: "r1", text: "Req 1", kind: "technical", priority: "must" },
          { id: "r1", text: "Req 2", kind: "domain", priority: "nice" },
        ],
      },
    };

    expect(InterviewKitSchema.safeParse(invalidKit).success).toBe(false);
  });

  it("rejects schedule day count not matching days_available", () => {
    const invalidKit = {
      ...validKit,
      schedule: {
        days_available: 3,
        days: validKit.schedule.days, // length 2
      },
    };

    expect(InterviewKitSchema.safeParse(invalidKit).success).toBe(false);
  });
});
