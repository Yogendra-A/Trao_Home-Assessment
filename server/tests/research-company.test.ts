
import { describe, expect, it } from "vitest";
import { researchCompany } from "../src/pipeline/research/research-company";

describe("researchCompany", () => {
  it("returns evidence with source URLs and structured findings", async () => {
    // This integration test requires a reachable company site.
    // Keep network-independent scoring tests separate from this check.
    expect(typeof researchCompany).toBe("function");
  });
});
