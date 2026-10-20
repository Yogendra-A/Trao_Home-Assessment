import { getDb, DB_NAME } from "../../../../server/src/db/client";

export async function GET() {
  const isProd = process.env.NODE_ENV === "production";

  try {
    const db = await getDb();

    if (db) {
      // Actually ping the database to verify active connection
      await db.command({ ping: 1 });

      return Response.json(
        {
          status: "ok",
          database: "mongodb_connected",
          databaseName: DB_NAME,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        },
        { status: 200 },
      );
    }

    if (isProd) {
      return Response.json(
        {
          status: "error",
          error: "Database service unavailable in production.",
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    return Response.json(
      {
        status: "ok",
        database: "persistent_repository_mode",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database check failed";

    return Response.json(
      {
        status: "error",
        error: isProd ? "Database service unavailable." : message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
