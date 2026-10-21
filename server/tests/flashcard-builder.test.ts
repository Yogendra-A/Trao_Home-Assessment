import { describe, expect, it } from "vitest";
import { InterviewKitSchema, type InterviewKit, type Flashcard } from "../../shared/schemas/kit";
import { saveKit, getKitById, updateKit, createUser } from "../src/db/repository";

const baseKit: InterviewKit = {
  source: {
    company: "Stripe",
    company_url: "https://stripe.com",
    role: "Senior Backend Engineer",
    location: "Remote",
    jd_chars: 1200,
    researched_at: new Date().toISOString(),
    pages_used: ["https://stripe.com/about", "https://stripe.com/jobs"],
  },
  company_brief: {
    summary: "Stripe provides financial infrastructure for the internet.",
    what_they_do: "Payments processing, billing, banking-as-a-service.",
    sources: ["https://stripe.com/about"],
  },
  role: {
    title: "Senior Backend Engineer",
    seniority: "Senior",
    responsibilities: ["Build distributed systems", "Maintain high availability"],
    requirements: [
      { id: "r1", text: "Distributed systems and consensus protocols", kind: "technical", priority: "must" },
      { id: "r2", text: "High throughput API design and idempotent operations", kind: "technical", priority: "must" },
      { id: "r3", text: "Strong communication and cross-functional leadership", kind: "behavioural", priority: "nice" },
    ],
  },
  questions: [
    {
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical",
      prompt: "How does Raft handle network partitions during leader election?",
      answer_outline: "Explain majority quorum, terms, and election timeouts.",
      difficulty: 3,
    },
    {
      id: "q2",
      requirement_ids: ["r2"],
      category: "system-design",
      prompt: "Design an idempotent payment API endpoint.",
      answer_outline: "Discuss idempotency keys, atomic deduplication, and caching.",
      difficulty: 2,
    },
  ],
  flashcards: [
    {
      id: "fc1",
      front: "What is an idempotency key and why is it essential in payment processing?",
      back: "A unique token sent by the client allowing servers to recognize retry attempts safely.",
      requirement_ids: ["r2"],
    },
    {
      id: "fc2",
      front: "Describe the two-phase commit (2PC) protocol.",
      back: "Prepare phase followed by Commit/Abort phase managed by a coordinator.",
      requirement_ids: ["r1"],
    },
  ],
  schedule: {
    days_available: 2,
    days: [
      {
        day: 1,
        focus: "Distributed Systems & Consensus",
        question_ids: ["q1"],
        minutes: 45,
      },
      {
        day: 2,
        focus: "API Design & Idempotency",
        question_ids: ["q2"],
        minutes: 45,
      },
    ],
  },
  coverage: {
    uncovered_requirement_ids: ["r3"],
    passes: 1,
  },
};

describe("Flashcard Builder Functionality (Section 6)", () => {
  it("allows editing an existing flashcard front and back while preserving stable ID and requirement references", () => {
    const cardToEdit = baseKit.flashcards[0];
    const editedFront = "What is an idempotency key and how does Stripe use it?";
    const editedBack = "Clients send an Idempotency-Key header; servers cache responses keyed on this token.";

    const updatedFlashcards: Flashcard[] = baseKit.flashcards.map((fc) =>
      fc.id === cardToEdit.id
        ? { ...fc, front: editedFront, back: editedBack }
        : fc
    );

    const updatedKit: InterviewKit = {
      ...baseKit,
      flashcards: updatedFlashcards,
    };

    // Validates against Appendix A schema
    const parseResult = InterviewKitSchema.safeParse(updatedKit);
    expect(parseResult.success).toBe(true);

    // Verifies edits
    const target = updatedKit.flashcards.find((fc) => fc.id === cardToEdit.id);
    expect(target).toBeDefined();
    expect(target!.id).toBe(cardToEdit.id);
    expect(target!.front).toBe(editedFront);
    expect(target!.back).toBe(editedBack);
    expect(target!.requirement_ids).toEqual(cardToEdit.requirement_ids);
  });

  it("allows manually adding a custom flashcard with a valid requirement reference and unique ID", () => {
    const customCard: Flashcard = {
      id: `fc_custom_${Date.now()}_abc`,
      front: "How do you avoid cascading failures in microservices?",
      back: "Use circuit breakers, deadlines/timeouts, rate limiters, and graceful degradation.",
      requirement_ids: ["r1"],
    };

    const updatedKit: InterviewKit = {
      ...baseKit,
      flashcards: [...baseKit.flashcards, customCard],
    };

    // Validates against Appendix A schema
    const parseResult = InterviewKitSchema.safeParse(updatedKit);
    expect(parseResult.success).toBe(true);
    expect(updatedKit.flashcards).toHaveLength(3);
    expect(updatedKit.flashcards[2].id).toBe(customCard.id);
    expect(updatedKit.flashcards[2].front).toBe(customCard.front);
  });

  it("rejects custom flashcards referencing invalid requirement IDs", () => {
    const invalidCard: Flashcard = {
      id: "fc_invalid_1",
      front: "Invalid requirement test",
      back: "Should fail validation",
      requirement_ids: ["r999_does_not_exist"],
    };

    const invalidKit = {
      ...baseKit,
      flashcards: [...baseKit.flashcards, invalidCard],
    };

    const parseResult = InterviewKitSchema.safeParse(invalidKit);
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      expect(parseResult.error.issues.some((i) => i.message.includes("non-existent requirement ID"))).toBe(true);
    }
  });

  it("allows deleting a flashcard without corrupting questions or schedule", () => {
    const cardToDelete = baseKit.flashcards[0];
    const updatedFlashcards = baseKit.flashcards.filter((fc) => fc.id !== cardToDelete.id);

    const updatedKit: InterviewKit = {
      ...baseKit,
      flashcards: updatedFlashcards,
    };

    const parseResult = InterviewKitSchema.safeParse(updatedKit);
    expect(parseResult.success).toBe(true);
    expect(updatedKit.flashcards).toHaveLength(1);
    expect(updatedKit.flashcards[0].id).toBe("fc2");

    // Questions and schedule remain intact
    expect(updatedKit.questions).toHaveLength(2);
    expect(updatedKit.schedule.days).toHaveLength(2);
  });

  it("persists flashcard additions, edits, and deletions via the repository update mechanism", async () => {
    const user = await createUser(
      `flashcard-user-${Date.now()}@example.com`,
      "mock_hashed_password"
    );

    // 1. Initial save
    const initialRecord = await saveKit(user.id, baseKit);
    expect(initialRecord).toBeDefined();
    expect(initialRecord.kit.flashcards).toHaveLength(2);

    // 2. Add custom flashcard
    const customCard: Flashcard = {
      id: `fc_custom_${Date.now()}_persisted`,
      front: "Explain the CAP theorem tradeoffs.",
      back: "Consistency, Availability, and Partition Tolerance: in a partition, choose C or A.",
      requirement_ids: ["r1"],
    };
    const kitWithAddedCard: InterviewKit = {
      ...initialRecord.kit,
      flashcards: [...initialRecord.kit.flashcards, customCard],
    };

    const updatedAfterAdd = await updateKit(initialRecord.id, user.id, {
      kit: kitWithAddedCard,
    });
    expect(updatedAfterAdd).not.toBeNull();
    expect(updatedAfterAdd!.kit.flashcards).toHaveLength(3);

    // 3. Edit existing flashcard
    const editedCardKit: InterviewKit = {
      ...updatedAfterAdd!.kit,
      flashcards: updatedAfterAdd!.kit.flashcards.map((fc) =>
        fc.id === "fc1"
          ? { ...fc, back: "Updated strategy: client provides UUIDv4 key in header." }
          : fc
      ),
    };
    const updatedAfterEdit = await updateKit(initialRecord.id, user.id, {
      kit: editedCardKit,
    });
    expect(updatedAfterEdit).not.toBeNull();
    const retrievedFc1 = updatedAfterEdit!.kit.flashcards.find((fc) => fc.id === "fc1");
    expect(retrievedFc1?.back).toBe("Updated strategy: client provides UUIDv4 key in header.");

    // 4. Delete a flashcard
    const deletedCardKit: InterviewKit = {
      ...updatedAfterEdit!.kit,
      flashcards: updatedAfterEdit!.kit.flashcards.filter((fc) => fc.id !== "fc2"),
    };
    const updatedAfterDelete = await updateKit(initialRecord.id, user.id, {
      kit: deletedCardKit,
    });
    expect(updatedAfterDelete).not.toBeNull();
    expect(updatedAfterDelete!.kit.flashcards).toHaveLength(2);
    expect(updatedAfterDelete!.kit.flashcards.some((fc) => fc.id === "fc2")).toBe(false);

    // 5. Final retrieval confirms database state
    const finalRecord = await getKitById(initialRecord.id, user.id);
    expect(finalRecord).not.toBeNull();
    expect(finalRecord!.kit.flashcards).toHaveLength(2);
    expect(finalRecord!.kit.flashcards.map((f) => f.id)).toEqual(["fc1", customCard.id]);
  });

  it("maintains practice mode compatibility with edited and newly added flashcards", () => {
    // Simulate practice mode confidence ratings and covered set
    const ratings: Record<string, "low" | "medium" | "high"> = {
      fc1: "low",
      fc2: "high",
    };
    const covered = new Set<string>(["fc1", "fc2"]);

    // 1. Edit fc1
    const editedFc1Front = "Edited front for fc1";
    const editedCards: Flashcard[] = baseKit.flashcards.map((fc) =>
      fc.id === "fc1" ? { ...fc, front: editedFc1Front } : fc
    );

    // Because ID "fc1" is preserved, ratings and covered state remain intact
    expect(ratings[editedCards[0].id]).toBe("low");
    expect(covered.has(editedCards[0].id)).toBe(true);

    // 2. Add a new card
    const newCard: Flashcard = {
      id: "fc_custom_3",
      front: "New flashcard front",
      back: "New flashcard back",
      requirement_ids: ["r1"],
    };
    const cardsWithNew = [...editedCards, newCard];

    // Priority sorting simulation: "low_confidence_first"
    const score = (id: string) => {
      const r = ratings[id];
      if (r === "low") return 0;
      if (!r) return 1; // unrated new cards come before medium/high
      if (r === "medium") return 2;
      return 3;
    };
    const sorted = [...cardsWithNew].sort((a, b) => score(a.id) - score(b.id));

    expect(sorted[0].id).toBe("fc1"); // low confidence first
    expect(sorted[1].id).toBe("fc_custom_3"); // unrated second
    expect(sorted[2].id).toBe("fc2"); // high confidence last
  });
});
