import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

// OpenRouter is OpenAI-API-compatible, so we drive it with the OpenAI SDK
// pointed at its base URL. Used to run Claude tailoring through a *second* rate
// pool (separate from the direct Anthropic account), so tailoring can be load-
// balanced across both for higher sustained throughput.
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set.");
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return _client;
}

export function hasOpenRouter(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

// Map our internal model ids to OpenRouter slugs (same underlying models). An
// id already in OpenRouter "vendor/model" form is passed through unchanged.
const OR_MODEL: Record<string, string> = {
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
  "claude-opus-4-8": "anthropic/claude-opus-4.8",
};
export function toOpenRouterModel(model?: string): string {
  if (model?.includes("/")) return model; // already an OpenRouter slug
  return (model && OR_MODEL[model]) || "anthropic/claude-sonnet-4.6";
}

/** Structured-output completion via OpenRouter (json_schema strict mode). */
export async function generateStructuredOpenRouter<T>({
  schema,
  schemaName,
  system,
  prompt,
  model,
  maxTokens = 4000,
}: {
  schema: z.ZodType<T>;
  schemaName: string;
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const t0 = Date.now();
  let completion;
  try {
    completion = await getClient().chat.completions.parse({
      model: toOpenRouterModel(model),
      max_completion_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: prompt },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 429) console.warn(`[llm] openrouter 429 (rate-limited) after ${Date.now() - t0}ms`);
    throw e;
  }
  const message = completion.choices[0]?.message;
  if (message?.refusal) throw new Error(`OpenRouter refused: ${message.refusal}`);
  if (!message?.parsed) throw new Error("OpenRouter returned no structured output.");
  if (process.env.LLM_DEBUG) console.log(`[llm] openrouter ${Date.now() - t0}ms out=${completion.usage?.completion_tokens ?? "?"}tok`);
  return message.parsed as T;
}
