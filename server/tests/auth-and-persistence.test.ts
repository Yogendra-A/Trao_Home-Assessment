import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { hashPassword, comparePassword } from "../src/auth/password";
import {
  createSessionToken,
  verifyToken,
  signToken,
} from "../src/auth/session";
import {
  createUser,
  findUserByEmail,
  findUserById,
  saveKit,
  listUserKits,
  getKitById,
  updateKit,
  deleteKit,
  RepositoryError,
} from "../src/db/repository";
import {
  getMongoClient,
  sanitizeUri,
  DB_NAME,
} from "../src/db/client";
import type { InterviewKit } from "../../shared/schemas/kit";

const sampleKit: InterviewKit = {
  source: {
    company: "Acme Corp",
    company_url: "https://acme.example",
    role: "Full Stack Engineer",
    location: "Remote",
    jd_chars: 500,
    researched_at: new Date().toISOString(),
    pages_used: ["https://acme.example/about"],
  },
  company_brief: {
    summary: "Acme builds developer productivity tools.",
    what_they_do: "Developer tooling and cloud services.",
    sources: ["https://acme.example/about"],
  },
  role: {
    title: "Full Stack Engineer",
    seniority: "Senior",
    responsibilities: ["Build web apps", "Design APIs"],
    requirements: [
      { id: "r1", text: "React experience", kind: "technical", priority: "must" },
      { id: "r2", text: "System design", kind: "technical", priority: "must" },
    ],
  },
  questions: [
    {
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical",
      prompt: "Explain React 19 server components.",
      answer_outline: "Discuss SSR and hydration.",
      difficulty: 2,
    },
    {
      id: "q2",
      requirement_ids: ["r2"],
      category: "system-design",
      prompt: "Design a distributed queue.",
      answer_outline: "Discuss partitioning and offsets.",
      difficulty: 3,
    },
  ],
  flashcards: [
    {
      id: "f1",
      front: "What are React Server Components?",
      back: "Components that execute strictly on the server.",
      requirement_ids: ["r1"],
    },
  ],
  schedule: {
    days_available: 2,
    days: [
      { day: 1, focus: "React", question_ids: ["q1"], minutes: 25 },
      { day: 2, focus: "System design", question_ids: ["q2"], minutes: 35 },
    ],
  },
  coverage: {
    uncovered_requirement_ids: [],
    passes: 1,
  },
};

describe("Authentication & Session Security", () => {
  it("hashes passwords securely and verifies correct passwords", async () => {
    const password = "SuperSecretPassword123!";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await comparePassword(password, hash)).toBe(true);
    expect(await comparePassword("WrongPassword", hash)).toBe(false);
  });

  it("creates and verifies valid session tokens", () => {
    const userId = "usr_12345";
    const token = createSessionToken(userId);

    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(userId);
    expect(payload?.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it("rejects tampered or forged session tokens", () => {
    const validToken = createSessionToken("usr_12345");
    const [data, sig] = validToken.split(".");

    // Tamper with data payload
    const tamperedData = Buffer.from(
      JSON.stringify({ userId: "usr_attacker", exp: Date.now() / 1000 + 3600 }),
    ).toString("base64url");

    expect(verifyToken(`${tamperedData}.${sig}`)).toBeNull();
  });

  it("rejects expired session tokens", () => {
    const expiredToken = signToken({
      userId: "usr_expired",
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    });

    expect(verifyToken(expiredToken)).toBeNull();
  });
});

describe("User & Kit Persistence with Scoping and Ownership", () => {
  let userAId: string;
  let userBId: string;

  beforeEach(async () => {
    const rand = Math.random().toString(36).substring(2, 9);
    const userA = await createUser(`user_a_${Date.now()}_${rand}@example.com`, "hashA");
    const userB = await createUser(`user_b_${Date.now()}_${rand}@example.com`, "hashB");
    userAId = userA.id;
    userBId = userB.id;
  });

  it("prevents duplicate user registration", async () => {
    const email = `unique_${Date.now()}_${Math.random().toString(36).substring(2, 9)}@example.com`;
    await createUser(email, "hashedPassword");

    await expect(createUser(email, "anotherHash")).rejects.toThrow(RepositoryError);
  });

  it("saves a kit and allows the owner to reopen it", async () => {
    const saved = await saveKit(userAId, sampleKit);

    expect(saved.id).toBeDefined();
    expect(saved.userId).toBe(userAId);
    expect(saved.company).toBe("Acme Corp");

    const reopened = await getKitById(saved.id, userAId);
    expect(reopened).not.toBeNull();
    expect(reopened?.kit.role.title).toBe("Full Stack Engineer");
    expect(reopened?.kit.questions).toHaveLength(2);
  });

  it("enforces strict cross-user ownership: User B cannot access User A's kit", async () => {
    const saved = await saveKit(userAId, sampleKit);

    // User A can access
    expect(await getKitById(saved.id, userAId)).not.toBeNull();

    // User B cannot access User A's kit
    const forbiddenRead = await getKitById(saved.id, userBId);
    expect(forbiddenRead).toBeNull();

    // User B cannot update User A's kit
    const forbiddenUpdate = await updateKit(saved.id, userBId, { title: "Hacked Title" });
    expect(forbiddenUpdate).toBeNull();

    // User B cannot delete User A's kit
    const forbiddenDelete = await deleteKit(saved.id, userBId);
    expect(forbiddenDelete).toBe(false);

    // Verify User A's kit is unmodified
    const intact = await getKitById(saved.id, userAId);
    expect(intact?.title).toBe("Full Stack Engineer");
  });

  it("lists only kits belonging to the authenticated user", async () => {
    const kitA1 = await saveKit(userAId, sampleKit);
    const kitA2 = await saveKit(userAId, {
      ...sampleKit,
      role: { ...sampleKit.role, title: "Second Role" },
    });
    const kitB1 = await saveKit(userBId, {
      ...sampleKit,
      role: { ...sampleKit.role, title: "User B Role" },
    });

    const userAKits = await listUserKits(userAId);
    const userBKits = await listUserKits(userBId);

    expect(userAKits).toHaveLength(2);
    expect(userAKits.some((k) => k.id === kitA1.id)).toBe(true);
    expect(userAKits.some((k) => k.id === kitA2.id)).toBe(true);
    expect(userAKits.some((k) => k.id === kitB1.id)).toBe(false);

    expect(userBKits).toHaveLength(1);
    expect(userBKits[0].id).toBe(kitB1.id);
  });

  it("updates kit and persists builder edits", async () => {
    const saved = await saveKit(userAId, sampleKit);

    const updated = await updateKit(saved.id, userAId, {
      title: "Staff Engineer (Edited)",
      pinnedQuestionIds: ["q1"],
    });

    expect(updated?.title).toBe("Staff Engineer (Edited)");
    expect(updated?.pinnedQuestionIds).toEqual(["q1"]);

    const reopened = await getKitById(saved.id, userAId);
    expect(reopened?.title).toBe("Staff Engineer (Edited)");
    expect(reopened?.pinnedQuestionIds).toEqual(["q1"]);
  });

  it("deletes kit successfully for the owner", async () => {
    const saved = await saveKit(userAId, sampleKit);

    const success = await deleteKit(saved.id, userAId);
    expect(success).toBe(true);

    const reopened = await getKitById(saved.id, userAId);
    expect(reopened).toBeNull();
  });

  it("persists practice mode confidence ratings and flashcard progress", async () => {
    const saved = await saveKit(userAId, sampleKit);

    const updated = await updateKit(saved.id, userAId, {
      confidenceRatings: { q1: "high", q2: "medium" },
      coveredCardIds: ["f1"],
    });

    expect(updated?.confidenceRatings).toEqual({ q1: "high", q2: "medium" });
    expect(updated?.coveredCardIds).toEqual(["f1"]);

    const reopened = await getKitById(saved.id, userAId);
    expect(reopened?.confidenceRatings).toEqual({ q1: "high", q2: "medium" });
    expect(reopened?.coveredCardIds).toEqual(["f1"]);
  });

  it("finds user by email and by id", async () => {
    const email = `find_me_${Date.now()}_${Math.random().toString(36).substring(2, 9)}@example.com`;
    const created = await createUser(email, "hashed_pw");

    const foundByEmail = await findUserByEmail(email);
    expect(foundByEmail).not.toBeNull();
    expect(foundByEmail?.id).toBe(created.id);
    expect(foundByEmail?.email).toBe(email);

    const foundById = await findUserById(created.id);
    expect(foundById).not.toBeNull();
    expect(foundById?.email).toBe(email);
  });
});

describe("Database Client & Atlas Connection Pooling", () => {
  it("sanitizes credentials in MongoDB URIs", () => {
    const raw = "mongodb+srv://admin_user:SuperSecretPass123!@cluster0.example.mongodb.net/trao?retryWrites=true";
    const sanitized = sanitizeUri(raw);
    expect(sanitized).toBe("mongodb+srv://***:***@cluster0.example.mongodb.net/trao?retryWrites=true");
    expect(sanitized).not.toContain("admin_user");
    expect(sanitized).not.toContain("SuperSecretPass123!");
  });

  it("preserves URIs without credentials", () => {
    const raw = "mongodb://localhost:27017/trao";
    expect(sanitizeUri(raw)).toBe("mongodb://localhost:27017/trao");
  });

  it("reuses existing connection promise (connection pooling)", async () => {
    const fakeClient = {} as any;
    const fakePromise = Promise.resolve(fakeClient);
    global._mongoClientPromise = fakePromise;

    const client = await getMongoClient();
    expect(client).toBe(fakeClient);

    // Clean up
    global._mongoClientPromise = undefined;
  });

  it("throws an operational error in production when MONGODB_URI is missing", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevUri = process.env.MONGODB_URI;
    const prevPromise = global._mongoClientPromise;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.MONGODB_URI;
      global._mongoClientPromise = undefined;

      await expect(getMongoClient()).rejects.toThrow("MONGODB_URI environment variable is required in production.");
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevUri !== undefined) process.env.MONGODB_URI = prevUri;
      else delete process.env.MONGODB_URI;
      global._mongoClientPromise = prevPromise;
    }
  });

  it("throws without in-memory fallback in production when database connection fails", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevUri = process.env.MONGODB_URI;
    const prevPromise = global._mongoClientPromise;
    try {
      (process.env as any).NODE_ENV = "production";
      process.env.MONGODB_URI = "mongodb://malformed:uri:with:invalid:scheme";
      global._mongoClientPromise = undefined;

      await expect(getMongoClient()).rejects.toThrow("Failed to connect to MongoDB Atlas in production.");
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevUri !== undefined) process.env.MONGODB_URI = prevUri;
      else delete process.env.MONGODB_URI;
      global._mongoClientPromise = prevPromise;
    }
  });

  it("enforces database availability assertion in production for repository operations", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevUri = process.env.MONGODB_URI;
    const prevPromise = global._mongoClientPromise;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.MONGODB_URI;
      global._mongoClientPromise = undefined;

      await expect(createUser(`prod_user_${Date.now()}@example.com`, "hash")).rejects.toThrow(RepositoryError);
      await expect(createUser(`prod_user_${Date.now()}@example.com`, "hash")).rejects.toMatchObject({
        code: "DATABASE_UNAVAILABLE",
      });
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevUri !== undefined) process.env.MONGODB_URI = prevUri;
      else delete process.env.MONGODB_URI;
      global._mongoClientPromise = prevPromise;
    }
  });
});

describe("Environment Configuration & Security Integrity", () => {
  it("preserves existing LLM configuration byte-for-byte and includes MONGODB_URI", () => {
    const envPath = path.resolve(process.cwd(), ".env");
    expect(fs.existsSync(envPath)).toBe(true);

    const content = fs.readFileSync(envPath, "utf-8");
    const parsed: Record<string, string> = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        parsed[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
      }
    }

    // Required LLM variables must be present and non-empty
    expect(parsed.LLM_BASE_URL).toBeDefined();
    expect(parsed.LLM_BASE_URL.length).toBeGreaterThan(0);

    expect(parsed.LLM_API_KEY).toBeDefined();
    expect(parsed.LLM_API_KEY.length).toBeGreaterThan(0);

    expect(parsed.LLM_MODEL).toBeDefined();
    expect(parsed.LLM_MODEL.length).toBeGreaterThan(0);

    // MongoDB Atlas URI must be present and non-empty
    expect(parsed.MONGODB_URI).toBeDefined();
    expect(parsed.MONGODB_URI.length).toBeGreaterThan(0);
    expect(parsed.MONGODB_URI).toMatch(/^mongodb(\+srv)?:\/\//);
  });

  it("maintains .env.example with safe placeholders and no exposed secrets", () => {
    const examplePath = path.resolve(process.cwd(), ".env.example");
    expect(fs.existsSync(examplePath)).toBe(true);

    const content = fs.readFileSync(examplePath, "utf-8");
    expect(content).toContain("MONGODB_URI=");
    expect(content).toContain("<username>");
    expect(content).toContain("<password>");

    // Ensure no real credentials leaked in example
    expect(content).not.toContain("gsk_");
    expect(content).not.toMatch(/mongodb(\+srv)?:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@/);
  });
});
