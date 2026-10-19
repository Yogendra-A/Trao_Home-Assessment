
import type { ExtractedRequirement } from "../requirements/extract";
import {
  generateQuestions,
  type GeneratedQuestion,
  type QuestionGenerator,
} from "./generate";

export interface CoverageResult {
  questions: GeneratedQuestion[];
  uncoveredRequirementIds: string[];
  passes: number;
}

export function findUncoveredRequirements(
  requirements: ExtractedRequirement[],
  questions: GeneratedQuestion[],
): string[] {
  const covered = new Set(questions.flatMap((q) => q.requirement_ids));

  return requirements
    .filter((requirement) => !covered.has(requirement.id))
    .map((requirement) => requirement.id);
}

export async function generateWithCoverage(
  requirements: ExtractedRequirement[],
  generate: QuestionGenerator,
  maxPasses = 2,
): Promise<CoverageResult> {
  if (!Number.isInteger(maxPasses) || maxPasses < 1 || maxPasses > 3) {
    throw new Error("maxPasses must be an integer between 1 and 3.");
  }

  let questions: GeneratedQuestion[] = [];
  let passes = 0;

  for (let pass = 1; pass <= maxPasses; pass++) {
    passes = pass;

    const uncoveredIds = findUncoveredRequirements(
      requirements,
      questions,
    );

    if (pass > 1 && uncoveredIds.length === 0) break;

    const targetRequirements =
      pass === 1
        ? requirements
        : requirements.filter((r) => uncoveredIds.includes(r.id));

    const generated = await generateQuestions(targetRequirements, generate);

    const existingIds = new Set(questions.map((q) => q.id));
    questions.push(...generated.filter((q) => !existingIds.has(q.id)));
  }

  return {
    questions,
    uncoveredRequirementIds: findUncoveredRequirements(
      requirements,
      questions,
    ),
    passes,
  };
}

export function assertMustHaveCoverage(
  requirements: ExtractedRequirement[],
  result: CoverageResult,
): void {
  const mustHaveIds = new Set(
    requirements
      .filter((r) => r.priority === "must")
      .map((r) => r.id),
  );

  const uncoveredMustHaves = result.uncoveredRequirementIds.filter((id) =>
    mustHaveIds.has(id),
  );

  if (uncoveredMustHaves.length > 0) {
    throw new Error(
      `Cannot finalize kit: uncovered must-have requirements: ${uncoveredMustHaves.join(", ")}`,
    );
  }
}
