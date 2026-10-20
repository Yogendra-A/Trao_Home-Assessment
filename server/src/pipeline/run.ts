
import { z } from "zod";
import {
  InterviewKitSchema,
  type InterviewKit,
  type Requirement,
  type Question,
} from "../../../shared/schemas/kit";
import { researchCompany } from "./research/research-company";
import { generateRequirements } from "./requirements/generate-requirements";
import {
  generateWithCoverage,
  assertMustHaveCoverage,
} from "./questions/coverage-loop";
import { generateStructuredJson } from "./llm/chat-completions";
import { allocateSchedule } from "./generation/schedule";
import { checkCoverage } from "./validation/coverage";

export interface PipelineInput {
  jd: string;
  company_url: string;
  days: number;
}

const CompanyBriefSchema = z.object({
  summary: z.string().trim().min(1),
  what_they_do: z.string().trim().min(1),
});

const RoleMetadataSchema = z.object({
  title: z.string().trim().min(1),
  seniority: z.string().trim().min(1),
  location: z.string().trim(),
  responsibilities: z.array(z.string().trim().min(1)),
});

function companyNameFromUrl(value: string): string {
  const hostname = new URL(value).hostname
    .replace(/^www\./i, "")
    .toLowerCase();

  return hostname.split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildFlashcards(requirements: Requirement[]) {
  return requirements.map((requirement) => ({
    id: `fc_${requirement.id}`,
    front: `How would you demonstrate: ${requirement.text}?`,
    back:
      "Prepare a specific explanation, relevant example, your approach, and the outcome. " +
      "Distinguish direct experience from concepts you would need to learn.",
    requirement_ids: [requirement.id],
  }));
}

export async function runInterviewPrepPipeline(
  input: PipelineInput,
): Promise<InterviewKit> {
  const jd = input.jd.trim();

  if (!jd) {
    throw new Error("Job description cannot be empty.");
  }

  if (jd.length > 100_000) {
    throw new Error("Job description exceeds the 100,000-character limit.");
  }

  if (
    !Number.isInteger(input.days) ||
    input.days < 1 ||
    input.days > 60
  ) {
    throw new Error("days must be an integer between 1 and 60.");
  }

  let companyUrl: URL;

  try {
    companyUrl = new URL(input.company_url);
  } catch {
    throw new Error("A valid company URL is required.");
  }

  if (!["http:", "https:"].includes(companyUrl.protocol)) {
    throw new Error("Company URL must use HTTP or HTTPS.");
  }

  // Research uses the existing URL, DNS, robots, and crawl policies.
  const research = await researchCompany(companyUrl.toString());

  // Extract requirements using the existing validated LLM integration.
  const requirements = await generateRequirements(jd);

  if (requirements.length === 0) {
    throw new Error(
      "No interview requirements could be extracted from the job description.",
    );
  }

  // Generate questions and make a bounded second pass for uncovered items.
  const coverageResult = await generateWithCoverage(
    requirements,
    generateStructuredJson,
    2,
  );

  assertMustHaveCoverage(requirements, coverageResult);

  const questions: Question[] = coverageResult.questions;

  // Check references and must-have coverage before scheduling.
  const coverageCheck = checkCoverage(requirements, questions);

  if (!coverageCheck.complete) {
    throw new Error(
      `Question coverage validation failed: ${JSON.stringify(coverageCheck)}`,
    );
  }

  const evidenceForPrompt = research.evidence.slice(0, 4).map((item) => ({
    url: item.url,
    title: item.title,
    text: item.text.slice(0, 600),
  }));

  const rawBrief = await generateStructuredJson(
    `Summarize the company using only the supplied website evidence.
Do not infer unsupported facts. If the evidence is insufficient, explicitly say so.
Return JSON with exactly these string fields: summary, what_they_do.

COMPANY URL: ${companyUrl.toString()}
WEBSITE EVIDENCE:
${JSON.stringify(evidenceForPrompt)}`,
  );

  const rawRole = await generateStructuredJson(
    `Extract role metadata using only the supplied job description.
Do not invent responsibilities, seniority, or location.
Use "Not specified" when the description does not establish a value.
Return JSON with exactly these fields:
title (string), seniority (string), location (string),
responsibilities (array of strings).

JOB DESCRIPTION:
${jd.slice(0, 4_000)}`,
  );

  const brief = CompanyBriefSchema.parse(rawBrief);
  const role = RoleMetadataSchema.parse(rawRole);

  const company = companyNameFromUrl(companyUrl.toString());
  const pagesUsed = research.evidence.map((item) => item.url);

  const schedule = allocateSchedule({
    daysAvailable: input.days,
    requirements,
    questions,
  });

  const kit = {
    source: {
      company,
      company_url: companyUrl.toString(),
      role: role.title,
      location: role.location,
      jd_chars: jd.length,
      researched_at: new Date().toISOString(),
      pages_used: pagesUsed,
    },
    company_brief: {
      summary: brief.summary,
      what_they_do: brief.what_they_do,
      sources: pagesUsed,
    },
    role: {
      title: role.title,
      seniority: role.seniority,
      responsibilities: role.responsibilities,
      requirements,
    },
    questions,
    flashcards: buildFlashcards(requirements),
    schedule,
    coverage: {
      uncovered_requirement_ids: coverageResult.uncoveredRequirementIds,
      passes: coverageResult.passes,
    },
  };

  // The final result must conform to the shared contract.
  return InterviewKitSchema.parse(kit);
}
