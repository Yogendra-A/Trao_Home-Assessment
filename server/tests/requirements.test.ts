
import { describe, expect, it, vi } from "vitest";
import {
  buildRequirementsPrompt,
  extractRequirements,
} from "../src/pipeline/requirements/extract";

describe("extractRequirements", () => {
  it("builds a prompt that preserves must/nice distinctions", () => {
    const prompt = buildRequirementsPrompt(
      "Required: Python. Bonus: experience with Docker.",
    );

    expect(prompt).toContain("must");
    expect(prompt).toContain("nice");
    expect(prompt).toContain("Required: Python");
  });

  it("validates, deduplicates and assigns stable IDs", async () => {
    const generate = vi.fn().mockResolvedValue({
      requirements: [
        { text: "Python programming", kind: "technical", priority: "must" },
        { text: "Python programming", kind: "technical", priority: "must" },
        { text: "Clear communication", kind: "behavioural", priority: "nice" },
      ],
    });

    const first = await extractRequirements("Python is required.", generate);
    const second = await extractRequirements("Python is required.", generate);

    expect(first).toHaveLength(2);
    expect(first[0].id).toMatch(/^r_[a-f0-9]{12}$/);
    expect(first[0].id).toBe(second[0].id);
  });

  it("rejects malformed model output", async () => {
    const generate = vi.fn().mockResolvedValue({
      requirements: [
        { text: "Python", kind: "unknown", priority: "must" },
      ],
    });

    await expect(
      extractRequirements("Python is required.", generate),
    ).rejects.toThrow();
  });

  it("rejects an empty job description", async () => {
    const generate = vi.fn();

    await expect(extractRequirements("  ", generate)).rejects.toThrow(
      /cannot be empty/i,
    );

    expect(generate).not.toHaveBeenCalled();
  });
});
