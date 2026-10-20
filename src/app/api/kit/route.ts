import "dotenv/config";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { runInterviewPrepPipeline } from "../../../../server/src/pipeline/run";
import { UrlPolicyError } from "../../../../server/src/pipeline/research/url-policy";
import { LlmError } from "../../../../server/src/pipeline/llm/chat-completions";


const RequestSchema = z.object({
  jd: z.string().min(1, "Job description is required."),
  company_url: z.string().min(1, "Company URL is required."),
  days: z.number().int().min(1).max(60),
});

function userFacingMessage(error: unknown): {
  message: string;
  code: string;
} {
  if (error instanceof UrlPolicyError) {
    return { message: error.message, code: "URL_REJECTED" };
  }

  if (error instanceof LlmError) {
    const retryable =
      error.code === "LLM_RATE_LIMIT" ||
      error.code === "LLM_TIMEOUT" ||
      error.code === "LLM_NETWORK_ERROR";

    return {
      message: retryable
        ? "The AI provider is temporarily unavailable. Please try again in a moment."
        : error.message,
      code: error.code,
    };
  }

  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return {
      message: first?.message ?? "Invalid request.",
      code: "VALIDATION_ERROR",
    };
  }

  if (error instanceof Error) {
    // Surface validation errors and coverage failures directly — these are
    // intended to be actionable for the user.
    const safe =
      error.message.startsWith("Job description") ||
      error.message.startsWith("days must") ||
      error.message.startsWith("Company URL") ||
      error.message.startsWith("A valid company URL") ||
      error.message.startsWith("No interview requirements") ||
      error.message.startsWith("Cannot finalize kit") ||
      error.message.startsWith("Question coverage validation failed");

    return {
      message: safe
        ? error.message
        : "An unexpected error occurred. Please check your inputs and try again.",
      code: "PIPELINE_ERROR",
    };
  }

  return { message: "An unexpected error occurred.", code: "UNKNOWN_ERROR" };
}

export async function POST(request: NextRequest) {
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
      {
        error: first?.message ?? "Invalid request.",
        code: "VALIDATION_ERROR",
      },
      { status: 422 },
    );
  }

  try {
    const kit = await runInterviewPrepPipeline({
      jd: parsed.data.jd,
      company_url: parsed.data.company_url,
      days: parsed.data.days,
    });

    return Response.json(kit, { status: 200 });
  } catch (error) {
    const { message, code } = userFacingMessage(error);

    const status =
      code === "URL_REJECTED" || code === "VALIDATION_ERROR"
        ? 422
        : code === "LLM_RATE_LIMIT"
          ? 429
          : code === "PIPELINE_ERROR" &&
              message.startsWith("Cannot finalize kit")
            ? 422
            : 500;

    return Response.json({ error: message, code }, { status });
  }
}
