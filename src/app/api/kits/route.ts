import "dotenv/config";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "../../../../server/src/auth/session";
import { listUserKits, saveKit } from "../../../../server/src/db/repository";
import { runInterviewPrepPipeline } from "../../../../server/src/pipeline/run";
import { UrlPolicyError } from "../../../../server/src/pipeline/research/url-policy";
import { LlmError } from "../../../../server/src/pipeline/llm/chat-completions";

const RequestSchema = z.object({
  jd: z.string().min(1, "Job description is required."),
  company_url: z.string().min(1, "Company URL is required."),
  days: z.number().int().min(1).max(60),
});

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Authentication required to view saved kits.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const kits = await listUserKits(session.userId);
  return Response.json({ kits });
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Authentication required to create and save kits.", code: "UNAUTHORIZED" },
      { status: 401 },
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

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { error: first?.message ?? "Invalid request.", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  try {
    const kit = await runInterviewPrepPipeline({
      jd: parsed.data.jd,
      company_url: parsed.data.company_url,
      days: parsed.data.days,
    });

    const savedRecord = await saveKit(session.userId, kit);

    return Response.json(savedRecord, { status: 201 });
  } catch (error) {
    if (error instanceof UrlPolicyError) {
      return Response.json(
        { error: error.message, code: "URL_REJECTED" },
        { status: 422 },
      );
    }

    if (error instanceof LlmError) {
      const retryable =
        error.code === "LLM_RATE_LIMIT" ||
        error.code === "LLM_TIMEOUT" ||
        error.code === "LLM_NETWORK_ERROR";

      return Response.json(
        {
          error: retryable
            ? "The AI provider is temporarily unavailable. Please try again in a moment."
            : error.message,
          code: error.code,
        },
        { status: error.code === "LLM_RATE_LIMIT" ? 429 : 500 },
      );
    }

    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return Response.json(
      { error: message, code: "PIPELINE_ERROR" },
      { status: 500 },
    );
  }
}
