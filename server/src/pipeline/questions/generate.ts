import { createHash } from "node:crypto";
import { z } from "zod";
import type { ExtractedRequirement } from "../requirements/extract";

export const QuestionSchema = z.object({
  requirement_ids: z.array(z.string()).min(1),
  category: z.enum([
    "technical",
    "behavioural",
    "system-design",
    "company-fit",
  ]),
  prompt: z.string().trim().min(1),
  answer_outline: z.string().trim().min(1),
  difficulty: z.number().int().min(1).max(3),
});

const ResponseSchema = z.object({
  questions: z.array(QuestionSchema),
});

export type GeneratedQuestion = z.infer<typeof QuestionSchema> & {
  id: string;
};

export type QuestionGenerator = (
  prompt: string,
  options?: { stage?: string; schema?: z.ZodType<any>; maxTokens?: number },
) => Promise<unknown>;

export interface ResearchContext {
  companyName?: string;
  hiringEvidence?: string[];
  techEvidence?: string[];
}

function stableId(value: string): string {
  return `q_${createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 12)}`;
}

export function filterRequirementsForCategory(
  requirements: ExtractedRequirement[],
  category: GeneratedQuestion["category"],
): ExtractedRequirement[] {
  let filtered: ExtractedRequirement[] = [];

  if (category === "technical") {
    filtered = requirements.filter(
      (r) => r.kind === "technical" || r.kind === "domain",
    );
  } else if (category === "behavioural") {
    filtered = requirements.filter((r) => r.kind === "behavioural");
  } else if (category === "system-design") {
    filtered = requirements.filter(
      (r) => r.kind === "technical" || r.kind === "domain",
    );
  } else if (category === "company-fit") {
    filtered = requirements.filter(
      (r) => r.kind === "domain" || r.priority === "must",
    );
  }

  // Fallback to must-haves or all requirements if category filter returned empty
  if (filtered.length === 0) {
    const mustHaves = requirements.filter((r) => r.priority === "must");
    return mustHaves.length > 0 ? mustHaves : requirements;
  }

  return filtered;
}

export function buildQuestionPrompt(
  requirements: ExtractedRequirement[],
  category: GeneratedQuestion["category"],
  researchContext?: ResearchContext,
): string {
  const compactRequirements = requirements.map((r) => ({
    id: r.id,
    text: r.text,
    kind: r.kind,
    priority: r.priority,
  }));

  const contextLines: string[] = [];
  if (researchContext?.companyName) {
    contextLines.push(`Company: ${researchContext.companyName}`);
  }

  // Include only relevant research context for each question category
  if (category === "technical" || category === "system-design") {
    if (researchContext?.techEvidence && researchContext.techEvidence.length > 0) {
      contextLines.push(
        `Technology Context: ${researchContext.techEvidence.slice(0, 2).join("; ")}`,
      );
    }
  } else if (category === "behavioural" || category === "company-fit") {
    if (researchContext?.hiringEvidence && researchContext.hiringEvidence.length > 0) {
      contextLines.push(
        `Hiring Context: ${researchContext.hiringEvidence.slice(0, 2).join("; ")}`,
      );
    }
  }

  const contextSection =
    contextLines.length > 0
      ? `\nCONTEXT:\n${contextLines.join("\n")}\n`
      : "";

  let categoryGuideline = "";
  if (category === "technical") {
    categoryGuideline = "Test technical depth, problem-solving, and practical engineering application.";
  } else if (category === "behavioural") {
    categoryGuideline = "Use the STAR method; prompt for specific past experiences, teamwork, and conflict handling.";
  } else if (category === "system-design") {
    categoryGuideline = "Test architectural trade-offs, scalability, data modeling, API design, or reliability.";
  } else if (category === "company-fit") {
    categoryGuideline = "Focus on company alignment, role motivation, and work environment preferences without inventing facts.";
  }

  return `Generate interview questions for the requirements below.

CATEGORY: ${category}
${contextSection}
Rules:
- Category Focus: ${categoryGuideline}
- Every question must reference one or more supplied requirement IDs in "requirement_ids".
- Set "category": "${category}" for every generated question.
- Cover the supplied requirements with 1-2 focused, high-signal questions.
- Provide a substantive answer outline detailing key concepts, trade-offs, or expected response structure (without unescaped newlines).
- Difficulty must be 1 (introductory), 2 (intermediate), or 3 (advanced).
- Return valid JSON strictly in this format:
{"questions":[{"requirement_ids":["r_..."],"category":"${category}","prompt":"...","answer_outline":"...","difficulty":2}]}

REQUIREMENTS:
${JSON.stringify(compactRequirements)}`;
}

export async function generateQuestions(
  requirements: ExtractedRequirement[],
  generate: QuestionGenerator,
  researchContext?: ResearchContext,
  categoriesToGenerate?: ReadonlyArray<GeneratedQuestion["category"]>,
): Promise<GeneratedQuestion[]> {
  if (requirements.length === 0) return [];

  const validIds = new Set(requirements.map((r) => r.id));
  const categories = categoriesToGenerate ?? ([
    "technical",
    "behavioural",
    "system-design",
    "company-fit",
  ] as const);

  const allQuestions: GeneratedQuestion[] = [];
  const seen = new Set<string>();

  for (const category of categories) {
    const relevantRequirements = filterRequirementsForCategory(
      requirements,
      category,
    );
    if (relevantRequirements.length === 0) continue;

    const response = await generate(
      buildQuestionPrompt(relevantRequirements, category, researchContext),
      {
        stage: `question_generation_${category}`,
        schema: ResponseSchema,
        maxTokens: 1800,
      },
    );
    const parsed = ResponseSchema.parse(response);

    for (const question of parsed.questions) {
      const resolvedCategory = category;

      if (question.requirement_ids.some((id) => !validIds.has(id))) {
        throw new Error("Question references an unknown requirement ID.");
      }

      const normalizedPrompt = question.prompt
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      if (seen.has(normalizedPrompt)) continue;
      seen.add(normalizedPrompt);

      const stableKey = [
        [...question.requirement_ids].sort().join(","),
        resolvedCategory,
        normalizedPrompt,
      ].join("|");

      allQuestions.push({
        ...question,
        category: resolvedCategory,
        id: stableId(stableKey),
      });
    }
  }

  return allQuestions;
}
