import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

// Lazily-constructed OpenAI client — used for the "trivial" structured
// extraction tasks (resume + job-description parsing). Tailoring stays on
// Claude (see lib/llm/anthropic.ts).
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set — add it to .env.");
    }
    _client = new OpenAI();
  }
  return _client;
}

export const OPENAI_EXTRACT_MODEL = process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4o-mini";
export const OPENAI_TAILOR_MODEL = process.env.OPENAI_TAILOR_MODEL ?? "gpt-4o-mini";

/**
 * Structured-output completion via OpenAI. Forces the model to return JSON
 * matching `schema` (strict JSON-schema mode). Throws on refusal or empty output.
 */
export async function generateStructuredOpenAI<T>({
  schema,
  schemaName,
  prompt,
  system,
  model = OPENAI_EXTRACT_MODEL,
  maxTokens = 4000,
}: {
  schema: z.ZodType<T>;
  schemaName: string;
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const completion = await getClient().chat.completions.parse({
    model,
    max_completion_tokens: maxTokens,
    messages: [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      { role: "user" as const, content: prompt },
    ],
    response_format: zodResponseFormat(schema, schemaName),
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI refused: ${message.refusal}`);
  if (!message?.parsed) throw new Error("OpenAI returned no structured output.");
  return message.parsed as T;
}
