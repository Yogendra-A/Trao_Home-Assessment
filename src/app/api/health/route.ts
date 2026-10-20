import { getDb } from "../../../../server/src/db/client";

export async function GET() {
  const db = await getDb();

  return Response.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: db ? "mongodb_connected" : "persistent_repository_mode",
      uptime: process.uptime(),
    },
    { status: 200 },
  );
}
