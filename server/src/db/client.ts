import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient | null> | null = null;
let isMongoAvailable: boolean | null = null;

export async function getMongoClient(): Promise<MongoClient | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    isMongoAvailable = false;
    return null;
  }

  if (isMongoAvailable === false) {
    return null;
  }

  if (client) {
    return client;
  }

  if (!clientPromise) {
    const mongoClient = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });

    clientPromise = mongoClient.connect().then(
      async (connectedClient) => {
        client = connectedClient;
        isMongoAvailable = true;
        await ensureIndexes(client.db());
        return client;
      },
      (error) => {
        console.warn(
          `[Database] MongoDB connection to ${uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")} failed: ${error instanceof Error ? error.message : String(error)}. Operating in fallback persistent repository mode.`,
        );
        isMongoAvailable = false;
        client = null;
        clientPromise = null;
        return null;
      },
    );
  }

  return clientPromise;
}

export async function getDb(): Promise<Db | null> {
  const c = await getMongoClient();
  return c ? c.db() : null;
}

async function ensureIndexes(db: Db): Promise<void> {
  try {
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("kits").createIndex({ userId: 1, createdAt: -1 });
  } catch (err) {
    console.error("[Database] Error ensuring indexes:", err);
  }
}
