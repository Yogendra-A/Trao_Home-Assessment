
export interface PipelineInput {
  jd: string;
  company_url: string;
  days: number;
}

export async function runInterviewPrepPipeline(
  _input: PipelineInput,
): Promise<unknown> {
  throw new Error(
    "Pipeline not implemented yet: company research and generation are pending.",
  );
}
