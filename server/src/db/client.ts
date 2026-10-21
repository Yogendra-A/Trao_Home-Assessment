import { MongoClient, Db } from "mongodb";

export const DB_NAME = process.env.MONGODB_DB_NAME || "trao";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient | null> | undefined;
  // eslint-disable-next-line no-var
  var _mongoIndexesEnsured: boolean | undefined;
}

export function sanitizeUri(uri: string): string {
  return uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
}

function sanitizeErrorMessage(msg: string): string {
  return msg.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
}

function logDatabaseConnectionError(sanitizedUri: string, error: unknown): void {
  const rawMsg = error instanceof Error ? error.message : String(error);
  const sanitizedMsg = sanitizeErrorMessage(rawMsg);

  console.error(`[Database] Connection to ${sanitizedUri} failed: ${sanitizedMsg}`);

  if (
    sanitizedMsg.includes("SSL alert number 80") ||
    sanitizedMsg.includes("ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR") ||
    sanitizedMsg.includes("tlsv1 alert internal error")
  ) {
    console.error(
      `[Database] DIAGNOSIS: MongoDB Atlas rejected the TLS connection (SSL alert 80).\n` +
      `[Database] This indicates that your outbound IP address is not authorized in MongoDB Atlas Network Access.\n` +
      `[Database] ACTION REQUIRED: In MongoDB Atlas Dashboard -> Security -> Network Access, add your current IP address (or 0.0.0.0/0 for broad development access).`
    );
  }
}

export async function getMongoClient(): Promise<MongoClient | null> {
  if (global._mongoClientPromise) {
    return global._mongoClientPromise;
  }

  const uri = process.env.MONGODB_URI;
  const isProd = process.env.NODE_ENV === "production";

  if (!uri) {
    if (isProd) {
      throw new Error("MONGODB_URI environment variable is required in production.");
    }
    return null;
  }

  const sanitized = sanitizeUri(uri);

  let client: MongoClient;
  try {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      retryWrites: true,
      retryReads: true,
    });
  } catch (error) {
    logDatabaseConnectionError(sanitized, error);
    if (isProd) {
      throw new Error("Failed to connect to MongoDB Atlas in production.");
    }
    return null;
  }

  const promise = client.connect().then(
    async (connectedClient) => {
      // Attach disconnect listeners to clear cached promise on connection loss
      connectedClient.on("close", () => {
        global._mongoClientPromise = undefined;
        global._mongoIndexesEnsured = undefined;
      });

      await ensureIndexes(connectedClient.db(DB_NAME));
      return connectedClient;
    },
    (error) => {
      logDatabaseConnectionError(sanitized, error);
      global._mongoClientPromise = undefined;

      if (isProd) {
        throw new Error("Failed to connect to MongoDB Atlas in production.");
      }
      return null;
    },
  );

  global._mongoClientPromise = promise;
  return promise;
}

export async function getDb(): Promise<Db | null> {
  const client = await getMongoClient();
  return client ? client.db(DB_NAME) : null;
}

export async function isDbConnected(): Promise<boolean> {
  try {
    const client = await getMongoClient();
    if (!client) return false;
    await client.db(DB_NAME).command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeDbConnection(): Promise<void> {
  if (global._mongoClientPromise) {
    try {
      const client = await global._mongoClientPromise;
      if (client) {
        await client.close();
      }
    } catch {
      // ignore
    } finally {
      global._mongoClientPromise = undefined;
      global._mongoIndexesEnsured = undefined;
    }
  }
}

async function ensureIndexes(db: Db): Promise<void> {
  if (global._mongoIndexesEnsured) return;
  try {
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("kits").createIndex({ userId: 1, updatedAt: -1 });
    global._mongoIndexesEnsured = true;
  } catch (err) {
    console.error("[Database] Error ensuring indexes:", err instanceof Error ? err.message : String(err));
  }
}
