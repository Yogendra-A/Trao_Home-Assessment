
import type { InterviewKit, Question } from "../../../../shared/schemas/kit";

export interface CoverageResult {
  uncovered_requirement_ids: string[];
  invalid_requirement_references: string[];
  questions_without_requirements: string[];
  complete: boolean;
}

export function checkCoverage(
  requirements: InterviewKit["role"]["requirements"],
  questions: Question[],
): CoverageResult {
  const validIds = new Set(requirements.map((r) => r.id));
  const coveredIds = new Set<string>();
  const invalidReferences = new Set<string>();
  const questionsWithoutRequirements: string[] = [];

  for (const question of questions) {
    if (question.requirement_ids.length === 0) {
      questionsWithoutRequirements.push(question.id);
    }

    for (const id of question.requirement_ids) {
      if (!validIds.has(id)) {
        invalidReferences.add(id);
      } else {
        coveredIds.add(id);
      }
    }
  }

  const uncovered = requirements
    .filter((r) => r.priority === "must" && !coveredIds.has(r.id))
    .map((r) => r.id);

  return {
    uncovered_requirement_ids: uncovered,
    invalid_requirement_references: [...invalidReferences],
    questions_without_requirements: questionsWithoutRequirements,
    complete:
      uncovered.length === 0 &&
      invalidReferences.size === 0 &&
      questionsWithoutRequirements.length === 0,
  };
}
