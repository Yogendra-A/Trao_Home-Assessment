import { z } from "zod";
import { UrlPolicyError } from "./research/url-policy";
import { LlmError } from "./llm/chat-completions";
import { RepositoryError } from "../db/repository";

export function toPipelineErrorResponse(error: unknown): Response {
  if (error instanceof RepositoryError && error.code === "DATABASE_UNAVAILABLE") {
    return Response.json(
      {
        error: "Database service is temporarily unavailable. Please try again shortly.",
        code: "SERVICE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  if (error instanceof UrlPolicyError) {
    return Response.json(
      { error: error.message, code: "URL_REJECTED" },
      { status: 422 },
    );
  }

  if (error instanceof LlmError) {
    const isRateLimit = error.code === "LLM_RATE_LIMIT";
    const status = isRateLimit ? 429 : 500;

    let message = error.message;
    if (isRateLimit) {
      message =
        "The AI provider is temporarily unavailable. Please try again in a moment.";
    } else if (error.providerMessage) {
      message = `AI provider error: ${error.providerMessage}`;
    } else if (
      error.code === "LLM_TIMEOUT" ||
      error.code === "LLM_NETWORK_ERROR"
    ) {
      message =
        "The AI provider is temporarily unavailable. Please try again in a moment.";
    }

    return Response.json({ error: message, code: error.code }, { status });
  }

  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return Response.json(
      {
        error: first?.message ?? "Invalid request.",
        code: "VALIDATION_ERROR",
      },
      { status: 422 },
    );
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

    const status =
      error.message.startsWith("Cannot finalize kit") ||
      error.message.startsWith("Question coverage validation failed")
        ? 422
        : 500;

    return Response.json(
      {
        error: safe
          ? error.message
          : "An unexpected error occurred. Please check your inputs and try again.",
        code: "PIPELINE_ERROR",
      },
      { status },
    );
  }

  return Response.json(
    { error: "An unexpected error occurred.", code: "UNKNOWN_ERROR" },
    { status: 500 },
  );
}
