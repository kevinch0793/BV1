import { z } from "zod";
import { generateStructuredOpenAI } from "@/lib/llm/openai";
import { generateStructuredOpenRouter, hasOpenRouter } from "@/lib/llm/openrouter";

// Light structured-extraction tasks (job-field parsing, JD-skill extraction) are
// quality-non-critical, so they run on a fast/cheap model (gpt-4o-mini). When an
// OpenRouter key is present we round-robin them across the OpenAI account AND
// OpenRouter (both run gpt-4o-mini) — two rate pools, so extraction doesn't
// bottleneck on a single account under load. Falls back to the other on error.
let rr = 0;

export async function generateStructuredExtract<T>(args: {
  schema: z.ZodType<T>;
  schemaName: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  const useOpenRouter = hasOpenRouter() && rr++ % 2 === 1;
  try {
    return useOpenRouter
      ? await generateStructuredOpenRouter({ ...args, model: "openai/gpt-4o-mini" })
      : await generateStructuredOpenAI(args);
  } catch (e) {
    // Fall back to the other pool so a throttled/erroring provider never fails
    // the job outright.
    try {
      return useOpenRouter
        ? await generateStructuredOpenAI(args)
        : hasOpenRouter()
          ? await generateStructuredOpenRouter({ ...args, model: "openai/gpt-4o-mini" })
          : Promise.reject(e);
    } catch {
      throw e;
    }
  }
}
