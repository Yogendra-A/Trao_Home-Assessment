import { type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "../../../../../../server/src/auth/session";
import { getKitById, updateKit } from "../../../../../../server/src/db/repository";
import { generateStructuredJson } from "../../../../../../server/src/pipeline/llm/chat-completions";
import { generateQuestions } from "../../../../../../server/src/pipeline/questions/generate";
import { allocateSchedule } from "../../../../../../server/src/pipeline/generation/schedule";
import type { Question } from "../../../../../../shared/schemas/kit";

const RegenerateRequestSchema = z.object({
  section: z.enum(["brief", "category", "schedule"]),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Authentication required.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const kitRecord = await getKitById(id, session.userId);

  if (!kitRecord) {
    return Response.json(
      { error: "Kit not found or access denied.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const parsed = RegenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request.", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  const { section, category } = parsed.data;
  const kit = { ...kitRecord.kit };

  try {
    if (section === "brief") {
      const evidence = kit.company_brief.sources.map((url) => ({ url, text: kit.company_brief.what_they_do }));
      const prompt = `Summarize the company using the available evidence.
Return JSON with exactly these string fields: summary, what_they_do.
COMPANY: ${kit.source.company}
URL: ${kit.source.company_url}`;

      const raw = await generateStructuredJson(prompt);
      const parsedBrief = z.object({ summary: z.string().min(1), what_they_do: z.string().min(1) }).parse(raw);

      kit.company_brief = {
        ...kit.company_brief,
        summary: parsedBrief.summary,
        what_they_do: parsedBrief.what_they_do,
      };
    } else if (section === "category") {
      if (!category) {
        return Response.json(
          { error: "Category is required when regenerating a question category.", code: "VALIDATION_ERROR" },
          { status: 422 },
        );
      }

      const generated = await generateQuestions(
        kit.role.requirements,
        generateStructuredJson,
        {
          companyName: kit.source.company,
        },
      );

      const newCategoryQuestions = generated.filter((q) => q.category === category);

      // PRESERVATION LOGIC:
      // Questions pinned, edited, or custom-written by the user MUST survive regeneration!
      const pinnedSet = new Set(kitRecord.pinnedQuestionIds || []);
      const customSet = new Set(kitRecord.customQuestionIds || []);
      const editedKeys = Object.keys(kitRecord.editedQuestions || {});
      const editedSet = new Set(editedKeys);

      const preservedQuestions: Question[] = kit.questions.filter((q) => {
        if (q.category !== category) return true; // Keep other categories
        // Keep in this category if pinned, custom, or edited
        return pinnedSet.has(q.id) || customSet.has(q.id) || editedSet.has(q.id);
      });

      // Avoid duplicates with preserved questions
      const existingPrompts = new Set(preservedQuestions.map((q) => q.prompt.toLowerCase().trim()));
      const incomingFresh = newCategoryQuestions.filter(
        (q) => !existingPrompts.has(q.prompt.toLowerCase().trim()),
      );

      kit.questions = [...preservedQuestions, ...incomingFresh];

      // Re-allocate schedule to balance the updated questions
      kit.schedule = allocateSchedule({
        daysAvailable: kit.schedule.days_available,
        requirements: kit.role.requirements,
        questions: kit.questions,
      });
    } else if (section === "schedule") {
      kit.schedule = allocateSchedule({
        daysAvailable: kit.schedule.days_available,
        requirements: kit.role.requirements,
        questions: kit.questions,
      });
    }

    const updated = await updateKit(id, session.userId, {
      kit,
      updatedAt: new Date().toISOString(),
    });

    return Response.json(updated, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to regenerate section.";
    return Response.json({ error: message, code: "REGENERATION_FAILED" }, { status: 500 });
  }
}
