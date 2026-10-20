import { describe, expect, it } from "vitest";
import { CompanyUnreachableError } from "../src/pipeline/run";
import { UrlPolicyError } from "../src/pipeline/research/url-policy";
import { LlmError } from "../src/pipeline/llm/chat-completions";

describe("evaluate CLI error classification", () => {
  // Simulate the classification logic used by evaluate.ts
  function classifyError(error: unknown): { code: string; message: string } {
    if (error instanceof CompanyUnreachableError) {
      return {
        code: "COMPANY_UNREACHABLE",
        message: error.message,
      };
    }

    if (error instanceof UrlPolicyError) {
      if (
        error.message.includes("could not be resolved") ||
        error.message.includes("has no IP") ||
        error.message.includes("unreachable")
      ) {
        return {
          code: "COMPANY_UNREACHABLE",
          message: `Company site unreachable after 3 retries: ${error.message}`,
        };
      }
      return {
        code: "URL_REJECTED",
        message: error.message,
      };
    }

    if (error instanceof LlmError) {
      return {
        code: error.code || "LLM_ERROR",
        message: error.message,
      };
    }

    if (error instanceof Error) {
      const msg = error.message;
      if (
        msg.includes("unreachable") ||
        msg.includes("could not be resolved") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("fetch failed") ||
        msg.includes("Page returned HTTP 404")
      ) {
        return {
          code: "COMPANY_UNREACHABLE",
          message: `Company site unreachable after 3 retries: ${msg}`,
        };
      }
      if (msg.includes("uncovered must-have requirements")) {
        return {
          code: "COVERAGE_FAILED",
          message: msg,
        };
      }
      if (msg.includes("No interview requirements could be extracted")) {
        return {
          code: "NO_REQUIREMENTS_EXTRACTED",
          message: msg,
        };
      }
      return {
        code: "PIPELINE_FAILED",
        message: msg,
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: String(error),
    };
  }

  it("classifies CompanyUnreachableError with COMPANY_UNREACHABLE code", () => {
    const error = new CompanyUnreachableError("Company site unreachable after 3 retries.");
    const classified = classifyError(error);

    expect(classified.code).toBe("COMPANY_UNREACHABLE");
    expect(classified.message).toContain("Company site unreachable");
  });

  it("classifies DNS resolution failure with COMPANY_UNREACHABLE code", () => {
    const error = new UrlPolicyError("Company hostname could not be resolved.");
    const classified = classifyError(error);

    expect(classified.code).toBe("COMPANY_UNREACHABLE");
    expect(classified.message).toContain("Company site unreachable after 3 retries");
  });

  it("classifies general URL policy rejection as URL_REJECTED", () => {
    const error = new UrlPolicyError("Only HTTP and HTTPS URLs are allowed.");
    const classified = classifyError(error);

    expect(classified.code).toBe("URL_REJECTED");
  });

  it("classifies coverage failure as COVERAGE_FAILED", () => {
    const error = new Error("Cannot finalize kit: uncovered must-have requirements: r1");
    const classified = classifyError(error);

    expect(classified.code).toBe("COVERAGE_FAILED");
  });

  it("classifies LLM rate limit with LLM_RATE_LIMIT code", () => {
    const error = new LlmError("Rate limit exceeded", "LLM_RATE_LIMIT", true);
    const classified = classifyError(error);

    expect(classified.code).toBe("LLM_RATE_LIMIT");
  });
});
