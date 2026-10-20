import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import type { UserRecord, KitRecord } from "./models";
import type { InterviewKit } from "../../../shared/schemas/kit";

// In-memory fallback stores for when MongoDB is not running or during local tests
const fallbackUsers = new Map<string, UserRecord>();
const fallbackKits = new Map<string, KitRecord>();

export class RepositoryError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

// ─────────────────────────────────────────────
// User Repository
// ─────────────────────────────────────────────

export async function createUser(
  email: string,
  passwordHash: string,
): Promise<UserRecord> {
  const normalizedEmail = email.toLowerCase().trim();
  const db = await getDb();

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
      throw err;
    }
  }

  // Fallback
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
  const db = await getDb();

  if (db) {
    const doc = await db.collection("users").findOne({ email: normalizedEmail });
    if (!doc) return null;
    return {
      id: doc.id || String(doc._id),
      email: doc.email,
      passwordHash: doc.passwordHash,
      createdAt: doc.createdAt,
    };
  }

  for (const user of fallbackUsers.values()) {
    if (user.email === normalizedEmail) {
      return user;
    }
  }

  return null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const db = await getDb();

  if (db) {
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
  const db = await getDb();
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
    await db.collection("kits").insertOne({
      _id: record.id as any,
      ...record,
    });
    return record;
  }

  fallbackKits.set(record.id, record);
  return record;
}

export async function listUserKits(
  userId: string,
): Promise<Array<Pick<KitRecord, "id" | "title" | "company" | "status" | "createdAt" | "updatedAt">>> {
  const db = await getDb();

  if (db) {
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
  const db = await getDb();

  if (db) {
    const doc = await db.collection("kits").findOne({
      $or: [{ id: kitId }, { _id: kitId as any }],
    });
    if (!doc) return null;
    // Enforce strict ownership check
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
  const db = await getDb();
  const now = new Date().toISOString();

  if (db) {
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
  const db = await getDb();

  if (db) {
    const result = await db.collection("kits").deleteOne({
      $and: [
        { $or: [{ id: kitId }, { _id: kitId as any }] },
        { userId },
      ],
    });
    return (result.deletedCount ?? 0) > 0;
  }

  const existing = fallbackKits.get(kitId);
  if (!existing || existing.userId !== userId) {
    return false;
  }

  return fallbackKits.delete(kitId);
}
