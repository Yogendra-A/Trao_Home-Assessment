import { type NextRequest } from "next/server";
import { getSessionFromRequest } from "../../../../../server/src/auth/session";
import {
  getKitById,
  updateKit,
  deleteKit,
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
  const kit = await getKitById(id, session.userId);

  if (!kit) {
    return Response.json(
      { error: "Kit not found or access denied.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return Response.json(kit, { status: 200 });
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

  const updated = await updateKit(id, session.userId, body as any);

  if (!updated) {
    return Response.json(
      { error: "Kit not found or access denied.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return Response.json(updated, { status: 200 });
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
  const success = await deleteKit(id, session.userId);

  if (!success) {
    return Response.json(
      { error: "Kit not found or access denied.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return Response.json({ success: true }, { status: 200 });
}
