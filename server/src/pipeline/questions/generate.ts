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

export type QuestionGenerator = (prompt: string) => Promise<unknown>;

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
  if (researchContext?.hiringEvidence && researchContext.hiringEvidence.length > 0) {
    contextLines.push(`Discovered Hiring Process: ${researchContext.hiringEvidence.join("; ")}`);
  }
  if (researchContext?.techEvidence && researchContext.techEvidence.length > 0) {
    contextLines.push(`Discovered Technology & Engineering Context: ${researchContext.techEvidence.join("; ")}`);
  }

  const contextSection = contextLines.length > 0
    ? `\nCOMPANY RESEARCH EVIDENCE:\n${contextLines.join("\n")}\nUse this evidence to tailor questions to this specific company's interview style and engineering environment where relevant. Do not invent unverified company claims.\n`
    : "";

  return `Generate interview questions for the requirements below.

CATEGORY: ${category}
${contextSection}
Rules:
- Use only the supplied requirements.
- Every question must reference one or more supplied requirement IDs.
- Set "category": "${category}" for every generated question.
- Cover all supplied requirements with 1-2 focused questions total.
- Do not invent company facts, interview stages, skills, or experience.
- Match the question to the selected category.
- Technical questions should test relevant engineering knowledge or application.
- Behavioural questions should ask for specific past examples.
- System-design questions should test architecture and trade-offs where relevant.
- Company-fit questions must use only the supplied context; if no company context is provided, focus on role motivation and work preferences without claiming company-specific facts.
- Provide a concise answer outline without raw unescaped newlines, not a complete scripted answer.
- Difficulty must be an integer from 1 to 3.
- Avoid duplicate questions.
- Return a valid JSON object only in this format:
{"questions":[{"requirement_ids":["r_example"],"category":"${category}","prompt":"...","answer_outline":"...","difficulty":2}]}

REQUIREMENTS:
${JSON.stringify(compactRequirements)}`;
}

export async function generateQuestions(
  requirements: ExtractedRequirement[],
  generate: QuestionGenerator,
  researchContext?: ResearchContext,
): Promise<GeneratedQuestion[]> {
  if (requirements.length === 0) return [];

  const validIds = new Set(requirements.map((r) => r.id));
  const categories = [
    "technical",
    "behavioural",
    "system-design",
    "company-fit",
  ] as const;

  const allQuestions: GeneratedQuestion[] = [];
  const seen = new Set<string>();

  // Separate calls keep category instructions distinct.
  for (const category of categories) {
    const response = await generate(
      buildQuestionPrompt(requirements, category, researchContext),
    );
    const parsed = ResponseSchema.parse(response);

    for (const question of parsed.questions) {
      // Normalize category to the category requested in this pass if different
      const resolvedCategory = question.category === category ? category : category;

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
