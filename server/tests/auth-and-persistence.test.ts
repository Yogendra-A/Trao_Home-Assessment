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
    const userA = await createUser(`user_a_${Date.now()}@example.com`, "hashA");
    const userB = await createUser(`user_b_${Date.now()}@example.com`, "hashB");
    userAId = userA.id;
    userBId = userB.id;
  });

  it("prevents duplicate user registration", async () => {
    const email = `unique_${Date.now()}@example.com`;
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
});
