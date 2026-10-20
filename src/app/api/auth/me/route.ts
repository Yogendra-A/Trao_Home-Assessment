import { type NextRequest } from "next/server";
import { getSessionFromRequest } from "../../../../../server/src/auth/session";
import { findUserById } from "../../../../../server/src/db/repository";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return Response.json(
      { error: "Not authenticated.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const user = await findUserById(session.userId);
  if (!user) {
    return Response.json(
      { error: "User not found or session expired.", code: "SESSION_EXPIRED" },
      { status: 401 },
    );
  }

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    },
  });
}
