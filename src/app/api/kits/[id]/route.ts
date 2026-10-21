import { type NextRequest } from "next/server";
import { getSessionFromRequest } from "../../../../../server/src/auth/session";
import {
  getKitById,
  updateKit,
  deleteKit,
  RepositoryError,
} from "../../../../../server/src/db/repository";

export async function GET(
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

  try {
    const kit = await getKitById(id, session.userId);

    if (!kit) {
      return Response.json(
        { error: "Kit not found or access denied.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return Response.json(kit, { status: 200 });
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
      { error: "Failed to retrieve kit.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function PUT(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null) {
    return Response.json(
      { error: "Invalid request payload.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  try {
    const updated = await updateKit(id, session.userId, body as any);

    if (!updated) {
      return Response.json(
        { error: "Kit not found or access denied.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return Response.json(updated, { status: 200 });
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
      { error: "Failed to update kit.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

  try {
    const success = await deleteKit(id, session.userId);

    if (!success) {
      return Response.json(
        { error: "Kit not found or access denied.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return Response.json({ success: true }, { status: 200 });
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
      { error: "Failed to delete kit.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
