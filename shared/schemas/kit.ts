import { z } from "zod";

export const RequirementKindSchema = z.enum([
  "technical",
  "behavioural",
  "domain",
]);

export const RequirementPrioritySchema = z.enum(["must", "nice"]);

export const QuestionCategorySchema = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);

export const RequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  kind: RequirementKindSchema,
  priority: RequirementPrioritySchema,
});

export const QuestionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()),
  category: QuestionCategorySchema,
  prompt: z.string(),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
});

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string(),
  back: z.string(),
  requirement_ids: z.array(z.string()),
});

export const ScheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative(),
});

export const InterviewKitSchema = z
  .object({
    source: z.object({
      company: z.string(),
      company_url: z.string(),
      role: z.string(),
      location: z.string(),
      jd_chars: z.number().int().nonnegative(),
      researched_at: z.string(),
      pages_used: z.array(z.string()),
    }),
    company_brief: z.object({
      summary: z.string(),
      what_they_do: z.string(),
      sources: z.array(z.string()),
    }),
    role: z.object({
      title: z.string(),
      seniority: z.string(),
      responsibilities: z.array(z.string()),
      requirements: z.array(RequirementSchema),
    }),
    questions: z.array(QuestionSchema),
    flashcards: z.array(FlashcardSchema),
    schedule: z.object({
      days_available: z.number().int().min(1).max(60),
      days: z.array(ScheduleDaySchema),
    }),
    coverage: z.object({
      uncovered_requirement_ids: z.array(z.string()),
      passes: z.number().int().min(1),
    }),
  })
  .superRefine((data, ctx) => {
    // 1. Unique requirement IDs
    const reqIds = new Set<string>();
    for (let i = 0; i < data.role.requirements.length; i++) {
      const id = data.role.requirements[i].id;
      if (reqIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate requirement ID: ${id}`,
          path: ["role", "requirements", i, "id"],
        });
      }
      reqIds.add(id);
    }

    // 2. Unique question IDs and valid requirement references
    const qIds = new Set<string>();
    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i];
      if (qIds.has(q.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate question ID: ${q.id}`,
          path: ["questions", i, "id"],
        });
      }
      qIds.add(q.id);

      for (const rid of q.requirement_ids) {
        if (!reqIds.has(rid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Question refers to non-existent requirement ID: ${rid}`,
            path: ["questions", i, "requirement_ids"],
          });
        }
      }
    }

    // 3. Flashcards valid requirement references
    for (let i = 0; i < data.flashcards.length; i++) {
      const fc = data.flashcards[i];
      for (const rid of fc.requirement_ids) {
        if (!reqIds.has(rid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Flashcard refers to non-existent requirement ID: ${rid}`,
            path: ["flashcards", i, "requirement_ids"],
          });
        }
      }
    }

    // 4. Schedule length matches days_available
    if (data.schedule.days.length !== data.schedule.days_available) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Schedule day count (${data.schedule.days.length}) must equal days_available (${data.schedule.days_available})`,
        path: ["schedule", "days"],
      });
    }

    // 5. Schedule question references must exist
    for (let i = 0; i < data.schedule.days.length; i++) {
      const day = data.schedule.days[i];
      for (const qid of day.question_ids) {
        if (!qIds.has(qid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Schedule day ${day.day} refers to non-existent question ID: ${qid}`,
            path: ["schedule", "days", i, "question_ids"],
          });
        }
      }
    }
  });

export type Requirement = z.infer<typeof RequirementSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type InterviewKit = z.infer<typeof InterviewKitSchema>;
