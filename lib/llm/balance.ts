import { z } from "zod";
import { generateStructuredOpenAI } from "@/lib/llm/openai";

// Light structured-extraction tasks (job-field parsing, JD-skill extraction) are
// quality-non-critical, so they run on a fast/cheap model (gpt-4o-mini) via OpenAI.
export async function generateStructuredExtract<T>(args: {
  schema: z.ZodType<T>;
  schemaName: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  return generateStructuredOpenAI(args);
}
