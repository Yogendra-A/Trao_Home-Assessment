import "dotenv/config";
import { type NextRequest } from "next/server";
import { KitGenerationRequestSchema } from "../../../../shared/schemas/kit";
import { runInterviewPrepPipeline } from "../../../../server/src/pipeline/run";
import { toPipelineErrorResponse } from "../../../../server/src/pipeline/error-response";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const parsed = KitGenerationRequestSchema.safeParse(body);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      {
        error: first?.message ?? "Invalid request.",
        code: "VALIDATION_ERROR",
      },
      { status: 422 },
    );
  }

  try {
    const kit = await runInterviewPrepPipeline({
      jd: parsed.data.jd,
      company_url: parsed.data.company_url,
      days: parsed.data.days,
    });

    return Response.json(kit, { status: 200 });
  } catch (error) {
    return toPipelineErrorResponse(error);
  }
}
