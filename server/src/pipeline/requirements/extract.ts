
import { createHash } from "node:crypto";
import { z } from "zod";

export const RequirementSchema = z.object({
  text: z.string().trim().min(1),
  kind: z.enum(["technical", "behavioural", "domain"]),
  priority: z.enum(["must", "nice"]),
});

export const RequirementsResponseSchema = z.object({
  requirements: z.array(RequirementSchema),
});

export type ExtractedRequirement = z.infer<typeof RequirementSchema> & {
  id: string;
};

export type RequirementsGenerator = (
  prompt: string,
) => Promise<unknown>;

export function buildRequirementsPrompt(jd: string): string {
  return `Extract the distinct interview-relevant requirements from this job description.

Rules:
- Use only information supported by the job description.
- Preserve the meaning of each requirement; do not invent skills or experience.
- Mark "must" for explicitly required qualifications, responsibilities, or skills.
- Mark "nice" for explicitly preferred, bonus, or optional qualifications.
- Classify each requirement as:
  - technical: programming, tools, engineering methods, or technical responsibilities
  - behavioural: communication, collaboration, leadership, or working style
  - domain: industry, product, business, or subject-matter knowledge
- Split materially different requirements into separate entries.
- Avoid duplicate requirements.
- If the description is sparse, return only the requirements it actually supports.
- Return JSON only, with this exact structure:
  {"requirements":[{"text":"...","kind":"technical","priority":"must"}]}

JOB DESCRIPTION:
${jd}`;
}

function stableRequirementId(text: string): string {
  const normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const hash = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 12);

  return `r_${hash}`;
}

export async function extractRequirements(
  jd: string,
  generate: RequirementsGenerator,
): Promise<ExtractedRequirement[]> {
  const input = jd.trim();

  if (!input) {
    throw new Error("Job description cannot be empty.");
  }

  const raw = await generate(buildRequirementsPrompt(input));
  const parsed = RequirementsResponseSchema.parse(raw);

  const seen = new Set<string>();

  return parsed.requirements
    .map((requirement) => ({
      ...requirement,
      id: stableRequirementId(requirement.text),
    }))
    .filter((requirement) => {
      const key = requirement.text.toLowerCase().replace(/\s+/g, " ").trim();

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
