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

export const RoleMetadataSchema = z.object({
  title: z.string().trim().min(1),
  seniority: z.string().trim().min(1),
  location: z.string().trim(),
  responsibilities: z.array(z.string().trim().min(1)),
});

export const JobAnalysisResponseSchema = z.object({
  role: RoleMetadataSchema,
  requirements: z.array(RequirementSchema),
});

export type ExtractedRequirement = z.infer<typeof RequirementSchema> & {
  id: string;
};

export type JobAnalysis = {
  role: z.infer<typeof RoleMetadataSchema>;
  requirements: ExtractedRequirement[];
};

export type RequirementsGenerator = (
  prompt: string,
  options?: { stage?: string; schema?: z.ZodType<any>; maxTokens?: number },
) => Promise<unknown>;

export function buildJobAnalysisPrompt(jd: string): string {
  return `Analyze this job description to extract role metadata and distinct interview-relevant requirements.

Rules:
- Use only facts supported by the job description. Do not invent unmentioned skills or responsibilities.
- For role: extract title, seniority (e.g. Junior, Mid, Senior, Lead, Staff, or "Not specified"), location (or "Not specified"), and key responsibilities.
- For requirements: extract distinct skills, tools, and qualifications.
  - Mark "must" for required items, "nice" for bonus/optional items.
  - Set kind: "technical", "behavioural", or "domain".
- Avoid duplicates. If description is brief, return only what it actually supports.
- Return JSON strictly in this format:
{"role":{"title":"...","seniority":"...","location":"...","responsibilities":["..."]},"requirements":[{"text":"...","kind":"technical","priority":"must"}]}

JOB DESCRIPTION:
${jd.slice(0, 4000)}`;
}

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

  const raw = await generate(buildRequirementsPrompt(input), {
    stage: "requirements_extraction",
    schema: RequirementsResponseSchema,
    maxTokens: 800,
  });
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

export async function extractJobAnalysis(
  jd: string,
  generate: RequirementsGenerator,
): Promise<JobAnalysis> {
  const input = jd.trim();

  if (!input) {
    throw new Error("Job description cannot be empty.");
  }

  const raw = await generate(buildJobAnalysisPrompt(input), {
    stage: "job_analysis",
    schema: JobAnalysisResponseSchema,
    maxTokens: 1000,
  });
  const parsed = JobAnalysisResponseSchema.parse(raw);

  const seen = new Set<string>();

  const requirements = parsed.requirements
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

  return {
    role: parsed.role,
    requirements,
  };
}
