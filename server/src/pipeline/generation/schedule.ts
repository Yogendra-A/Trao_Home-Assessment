
import type { InterviewKit, Question } from "../../../../shared/schemas/kit";

export interface ScheduleInput {
  daysAvailable: number;
  requirements: InterviewKit["role"]["requirements"];
  questions: Question[];
}

export function allocateSchedule(input: ScheduleInput): InterviewKit["schedule"] {
  const { daysAvailable, requirements, questions } = input;

  if (!Number.isInteger(daysAvailable) || daysAvailable < 1 || daysAvailable > 60) {
    throw new Error("daysAvailable must be an integer between 1 and 60.");
  }

  const requirementById = new Map(requirements.map((r) => [r.id, r]));
  const questionIds = new Set(questions.map((q) => q.id));

  // Reject duplicate question IDs because the schedule references questions by ID.
  if (questionIds.size !== questions.length) {
    throw new Error("Question IDs must be unique.");
  }

  // Prioritize must-have requirements, then higher-difficulty questions.
  const ordered = [...questions].sort((a, b) => {
    const priority = (q: Question) =>
      q.requirement_ids.some((id) => requirementById.get(id)?.priority === "must")
        ? 0
        : 1;

    return priority(a) - priority(b) || b.difficulty - a.difficulty || a.id.localeCompare(b.id);
  });

  // Round-robin assignment balances questions across the requested days.
  const assigned: Question[][] = Array.from(
    { length: daysAvailable },
    () => [],
  );

  ordered.forEach((question, index) => {
    assigned[index % daysAvailable].push(question);
  });

  const days = assigned.map((dayQuestions, index) => {
    const mustTopics = new Set<string>();

    for (const question of dayQuestions) {
      for (const id of question.requirement_ids) {
        const requirement = requirementById.get(id);
        if (requirement?.priority === "must") {
          mustTopics.add(requirement.text);
        }
      }
    }

    const focus =
      mustTopics.size > 0
        ? [...mustTopics].slice(0, 3).join("; ")
        : dayQuestions.length > 0
          ? "Review questions and reinforce key concepts"
          : "Review notes and consolidate previous learning";

    // Integer minutes: 15 for difficulty 1, 25 for 2, 35 for 3.
    const minutes = dayQuestions.reduce(
      (total, question) => total + 5 + question.difficulty * 10,
      0,
    );

    return {
      day: index + 1,
      focus,
      question_ids: dayQuestions.map((q) => q.id),
      minutes,
    };
  });

  // Verify every question is scheduled exactly once.
  const scheduledIds = days.flatMap((day) => day.question_ids);

  if (
    scheduledIds.length !== questions.length ||
    scheduledIds.some((id) => !questionIds.has(id)) ||
    new Set(scheduledIds).size !== scheduledIds.length
  ) {
    throw new Error("Schedule allocation produced invalid question references.");
  }

  // Every must-have requirement must have a question and that question must be scheduled.
  const coveredMustIds = new Set(
    questions
      .filter((q) =>
        q.requirement_ids.some((id) => requirementById.get(id)?.priority === "must"),
      )
      .flatMap((q) => q.requirement_ids),
  );

  const missingMust = requirements.filter(
    (r) => r.priority === "must" && !coveredMustIds.has(r.id),
  );

  if (missingMust.length > 0) {
    throw new Error(
      `Cannot schedule uncovered must-have requirements: ${missingMust.map((r) => r.id).join(", ")}`,
    );
  }

  return {
    days_available: daysAvailable,
    days,
  };
}
