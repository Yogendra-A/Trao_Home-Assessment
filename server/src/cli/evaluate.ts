
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { InterviewKitSchema } from "../../../shared/schemas/kit";
import { runInterviewPrepPipeline } from "../pipeline/run";

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
    if (args[i] === "--input") input = args[++i];
    else if (args[i] === "--output") output = args[++i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }

  if (!input || !output) {
    throw new Error(
      "Usage: npm run evaluate -- --input <cases.json> --output <kits.json>",
    );
  }

  return { input, output };
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
      const message =
        error instanceof Error ? error.message : "Unknown pipeline error";

      results.push({
        id: item.id,
        status: "failed",
        kit: null,
        error: {
          code: "PIPELINE_FAILED",
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
