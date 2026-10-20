import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { InterviewKitSchema } from "../../../shared/schemas/kit";
import { runInterviewPrepPipeline, CompanyUnreachableError } from "../pipeline/run";
import { UrlPolicyError } from "../pipeline/research/url-policy";
import { LlmError } from "../pipeline/llm/chat-completions";

// Ensure local fixture testing works seamlessly from a clean clone during evaluate runs
if (!process.env.ALLOW_PRIVATE_URLS) {
  process.env.ALLOW_PRIVATE_URLS = "true";
}

const CaseSchema = z.object({
  id: z.string().min(1),
  jd: z.string(),
  company_url: z.string(),
  days: z.number().int().min(1).max(60),
});

const InputSchema = z.array(CaseSchema);

type EvaluationResult = {
  id: string;
  status: "ok" | "failed";
  kit: unknown | null;
  error: { code: string; message: string } | null;
};

function getArguments(args: string[]) {
  let input: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input") {
      input = args[++i];
    } else if (arg.startsWith("--input=")) {
      input = arg.slice("--input=".length);
    } else if (arg === "--output") {
      output = args[++i];
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!input || !output) {
    throw new Error(
      "Usage: npm run evaluate -- --input <cases.json> --output <kits.json>",
    );
  }

  return { input, output };
}

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
      msg.includes("must use HTTP or HTTPS") ||
      msg.includes("Only HTTP and HTTPS") ||
      msg.includes("A valid company URL is required")
    ) {
      return {
        code: "URL_REJECTED",
        message: msg,
      };
    }
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

async function main() {
  const { input, output } = getArguments(process.argv.slice(2));
  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output);

  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const parsed = InputSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(`Invalid input cases: ${parsed.error.message}`);
  }

  const results: EvaluationResult[] = [];

  for (const item of parsed.data) {
    try {
      const kit = await runInterviewPrepPipeline({
        jd: item.jd,
        company_url: item.company_url,
        days: item.days,
      });

      const validatedKit = InterviewKitSchema.parse(kit);

      results.push({
        id: item.id,
        status: "ok",
        kit: validatedKit,
        error: null,
      });
    } catch (error) {
      const { code, message } = classifyError(error);

      results.push({
        id: item.id,
        status: "failed",
        kit: null,
        error: {
          code,
          message,
        },
      });
    }
  }

  const outputData = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: results,
  };

  await writeFile(outputPath, JSON.stringify(outputData, null, 2), "utf8");

  const succeeded = results.filter((r) => r.status === "ok").length;
  const failed = results.length - succeeded;

  console.log(`Evaluation complete: ${succeeded} succeeded, ${failed} failed.`);
  console.log(`Output: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
