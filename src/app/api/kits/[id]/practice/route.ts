import { type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "../../../../../../server/src/auth/session";
import { getKitById, updateKit } from "../../../../../../server/src/db/repository";

const PracticeUpdateSchema = z.object({
  confidenceRatings: z.record(z.string(), z.enum(["low", "medium", "high"])),
  coveredCardIds: z.array(z.string()),
});

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

  const parsed = PracticeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid practice payload.", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  const updated = await updateKit(id, session.userId, {
    confidenceRatings: {
      ...kitRecord.confidenceRatings,
      ...parsed.data.confidenceRatings,
    },
    coveredCardIds: Array.from(
      new Set([...(kitRecord.coveredCardIds || []), ...parsed.data.coveredCardIds]),
    ),
  });

  return Response.json(
    {
      confidenceRatings: updated?.confidenceRatings,
      coveredCardIds: updated?.coveredCardIds,
    },
    { status: 200 },
  );
}
