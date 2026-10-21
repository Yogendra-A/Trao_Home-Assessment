import "dotenv/config";
import { type NextRequest } from "next/server";
import { getSessionFromRequest } from "../../../../server/src/auth/session";
import {
  listUserKits,
  saveKit,
  RepositoryError,
} from "../../../../server/src/db/repository";
import { runInterviewPrepPipeline } from "../../../../server/src/pipeline/run";
import { KitGenerationRequestSchema } from "../../../../shared/schemas/kit";
import { toPipelineErrorResponse } from "../../../../server/src/pipeline/error-response";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Authentication required to view saved kits.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  try {
    const kits = await listUserKits(session.userId);
    return Response.json({ kits });
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "DATABASE_UNAVAILABLE") {
      return Response.json(
        {
          error: "Database service is temporarily unavailable. Please try again shortly.",
          code: "SERVICE_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    return Response.json(
      { error: "Failed to list interview kits.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
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

  const parsed = KitGenerationRequestSchema.safeParse(body);
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
    return toPipelineErrorResponse(error);
  }
}
