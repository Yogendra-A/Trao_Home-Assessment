import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { getDb } from "./client";
import type { UserRecord, KitRecord } from "./models";
import type { InterviewKit } from "../../../shared/schemas/kit";

// In-memory fallback stores for deliberate test/offline modes
const fallbackUsers = new Map<string, UserRecord>();
const fallbackKits = new Map<string, KitRecord>();

export class RepositoryError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

let warnedFallback = false;

/**
 * In-memory fallback is strictly allowed ONLY when:
 * 1. Explicitly enabled via ALLOW_IN_MEMORY_FALLBACK="true" (for unit tests / CLI offline mode).
 * 2. MONGODB_URI is not set AND NODE_ENV is not production.
 *
 * If MONGODB_URI is configured, MongoDB is the intended store and fallback is NOT permitted
 * unless ALLOW_IN_MEMORY_FALLBACK="true".
 */
export function isInMemoryFallbackAllowed(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return (
    process.env.ALLOW_IN_MEMORY_FALLBACK === "true" ||
    !process.env.MONGODB_URI
  );
}

export function clearFallbackStore(): void {
  fallbackUsers.clear();
  fallbackKits.clear();
}

async function getActiveDb(): Promise<Db | null> {
  const fallbackAllowed = isInMemoryFallbackAllowed();

  try {
    const db = await getDb();
    if (db) {
      return db;
    }
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw error;
    }
    if (!fallbackAllowed) {
      throw new RepositoryError(
        "Database service is unavailable. Please check your database connection or MongoDB Atlas IP whitelist.",
        "DATABASE_UNAVAILABLE",
      );
    }
  }

  if (!fallbackAllowed) {
    throw new RepositoryError(
      "Database service is unavailable. Please check your database connection or MongoDB Atlas IP whitelist.",
      "DATABASE_UNAVAILABLE",
    );
  }

  if (!warnedFallback && process.env.NODE_ENV !== "test") {
    warnedFallback = true;
    console.warn(
      "[Database] Notice: Using volatile in-memory fallback store. User accounts and interview kits will NOT persist across server restarts.",
    );
  }

  return null;
}

// ─────────────────────────────────────────────
// User Repository
// ─────────────────────────────────────────────

export async function createUser(
  email: string,
  passwordHash: string,
): Promise<UserRecord> {
  const normalizedEmail = email.toLowerCase().trim();
  const db = await getActiveDb();

  const user: UserRecord = {
    id: `usr_${randomUUID()}`,
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  if (db) {
    try {
      await db.collection("users").insertOne({
        _id: user.id as unknown as any,
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        createdAt: user.createdAt,
      });
      return user;
    } catch (err: any) {
      if (err.code === 11000 || err.message?.includes("duplicate")) {
        throw new RepositoryError("A user with this email already exists.", "USER_EXISTS");
      }
      throw new RepositoryError(
        "Failed to write user to database.",
        "DATABASE_UNAVAILABLE",
      );
    }
  }

  // Fallback (only when explicitly permitted)
  for (const existing of fallbackUsers.values()) {
    if (existing.email === normalizedEmail) {
      throw new RepositoryError("A user with this email already exists.", "USER_EXISTS");
    }
  }

  fallbackUsers.set(user.id, user);
  return user;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const db = await getActiveDb();

  if (db) {
    try {
      const doc = await db.collection("users").findOne({ email: normalizedEmail });
      if (!doc) return null;
      return {
        id: doc.id || String(doc._id),
        email: doc.email,
        passwordHash: doc.passwordHash,
        createdAt: doc.createdAt,
      };
    } catch (err: any) {
      throw new RepositoryError(
        "Failed to query user from database.",
        "DATABASE_UNAVAILABLE",
      );
    }
  }

  // Fallback (only when explicitly permitted)
  for (const user of fallbackUsers.values()) {
    if (user.email === normalizedEmail) {
      return user;
    }
  }

  return null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const db = await getActiveDb();

  if (db) {
    try {
      const doc = await db.collection("users").findOne({
        $or: [{ id }, { _id: id as any }],
      });
      if (!doc) return null;
      return {
        id: doc.id || String(doc._id),
        email: doc.email,
        passwordHash: doc.passwordHash,
        createdAt: doc.createdAt,
      };
    } catch (err: any) {
      throw new RepositoryError(
        "Failed to query user by id from database.",
        "DATABASE_UNAVAILABLE",
      );
    }
  }

  return fallbackUsers.get(id) || null;
}

// ─────────────────────────────────────────────
// Kit Repository
// ─────────────────────────────────────────────

export async function saveKit(
  userId: string,
  kit: InterviewKit,
): Promise<KitRecord> {
  const db = await getActiveDb();

  const now = new Date().toISOString();

  const record: KitRecord = {
    id: `kit_${randomUUID()}`,
    userId,
    title: kit.role?.title || "Untitled Kit",
    company: kit.source?.company || "Unknown Company",
    status: "completed",
    kit,
    pinnedQuestionIds: [],
    customQuestionIds: [],
    editedQuestions: {},
    confidenceRatings: {},
    coveredCardIds: [],
    createdAt: now,
    updatedAt: now,
  };

  if (db) {
    try {
      await db.collection("kits").insertOne({
        _id: record.id as any,
        ...record,
      });
      return record;
    } catch (err: any) {
      throw new RepositoryError(
        "Failed to save kit to database.",
        "DATABASE_UNAVAILABLE",
      );
    }
  }

  fallbackKits.set(record.id, record);
  return record;
}

export async function listUserKits(
  userId: string,
): Promise<Array<Pick<KitRecord, "id" | "title" | "company" | "status" | "createdAt" | "updatedAt">>> {
  const db = await getActiveDb();

  if (db) {
    try {
      const docs = await db
        .collection("kits")
        .find({ userId })
        .sort({ updatedAt: -1 })
        .project({ id: 1, title: 1, company: 1, status: 1, createdAt: 1, updatedAt: 1 })
        .toArray();

      return docs.map((doc) => ({
        id: doc.id || String(doc._id),
        title: doc.title,
        company: doc.company,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));
    } catch (err: any) {
      throw new RepositoryError(
        "Failed to list user kits from database.",
        "DATABASE_UNAVAILABLE",
      );
    }
  }

  const results: KitRecord[] = [];
  for (const kit of fallbackKits.values()) {
    if (kit.userId === userId) {
      results.push(kit);
    }
  }

  return results
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ id, title, company, status, createdAt, updatedAt }) => ({
      id,
      title,
      company,
      status,
      createdAt,
      updatedAt,
    }));
}

export async function getKitById(
  kitId: string,
  userId: string,
): Promise<KitRecord | null> {
  const db = await getActiveDb();

  if (db) {
    try {
      const doc = await db.collection("kits").findOne({
        $or: [{ id: kitId }, { _id: kitId as any }],
      });
      if (!doc) return null;
      // Strict user ownership enforcement
      if (doc.userId !== userId) {
        return null;
      }
      return {
        id: doc.id || String(doc._id),
        userId: doc.userId,
        title: doc.title,
        company: doc.company,
        status: doc.status,
        kit: doc.kit,
        pinnedQuestionIds: doc.pinnedQuestionIds || [],
        customQuestionIds: doc.customQuestionIds || [],
        editedQuestions: doc.editedQuestions || {},
        confidenceRatings: doc.confidenceRatings || {},
        coveredCardIds: doc.coveredCardIds || [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    } catch (err: any) {
      throw new RepositoryError(
        "Failed to query kit from database.",
        "DATABASE_UNAVAILABLE",
      );
    }
  }

  const record = fallbackKits.get(kitId);
  if (!record || record.userId !== userId) {
    return null;
  }
  return record;
}

export async function updateKit(
  kitId: string,
  userId: string,
  update: Partial<Omit<KitRecord, "id" | "userId" | "createdAt">>,
): Promise<KitRecord | null> {
  const db = await getActiveDb();

  const now = new Date().toISOString();

  if (db) {
    try {
      const existing = await db.collection("kits").findOne({
        $or: [{ id: kitId }, { _id: kitId as any }],
      });
      if (!existing || existing.userId !== userId) {
        return null;
      }

      const setPayload: Record<string, any> = {
        ...update,
        updatedAt: now,
      };

      await db.collection("kits").updateOne(
        { $or: [{ id: kitId }, { _id: kitId as any }] },
        { $set: setPayload },
      );

      return getKitById(kitId, userId);
    } catch (err: any) {
      if (err instanceof RepositoryError) throw err;
      throw new RepositoryError(
        "Failed to update kit in database.",
        "DATABASE_UNAVAILABLE",
      );
    }
  }

  const existing = fallbackKits.get(kitId);
  if (!existing || existing.userId !== userId) {
    return null;
  }

  const updated: KitRecord = {
    ...existing,
    ...update,
    updatedAt: now,
  };

  fallbackKits.set(kitId, updated);
  return updated;
}

export async function deleteKit(
  kitId: string,
  userId: string,
): Promise<boolean> {
  const db = await getActiveDb();

  if (db) {
    try {
      const result = await db.collection("kits").deleteOne({
        $and: [
          { $or: [{ id: kitId }, { _id: kitId as any }] },
          { userId },
        ],
      });
      return (result.deletedCount ?? 0) > 0;
    } catch (err: any) {
      throw new RepositoryError(
        "Failed to delete kit from database.",
        "DATABASE_UNAVAILABLE",
      );
    }
  }

  const existing = fallbackKits.get(kitId);
  if (!existing || existing.userId !== userId) {
    return false;
  }

  return fallbackKits.delete(kitId);
}
