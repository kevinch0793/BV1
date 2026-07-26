import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { recordUsage } from "@/lib/llm/usage";

// Lazily-constructed shared client — reads ANTHROPIC_API_KEY from the
// environment. Lazy so importing this module (e.g. during `next build`) doesn't
// require the key to be present; it's only needed when a request runs.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.");
    }
    // maxRetries 4 so transient 429 throttling self-heals (honoring retry-after)
    // instead of failing a job mid-batch.
    _client = new Anthropic({ maxRetries: 4 });
  }
  return _client;
}

export const DEFAULT_MODEL = process.env.TAILOR_MODEL ?? "claude-sonnet-4-6";
export const EXTRACT_MODEL = process.env.EXTRACT_MODEL ?? "claude-sonnet-4-6";

// Models the user can pick from in the UI.
export const MODEL_OPTIONS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (fast, default)" },
  { id: "claude-opus-4-8", label: "Opus 4.8 (highest quality)" },
] as const;

/**
 * Run a single structured-output completion. Uses messages.parse + a Zod output
 * format, so the model is forced to return JSON matching `schema` (validated at
 * the SDK layer — it retries on mismatch). Throws if no valid output comes back.
 */
export async function generateStructured<T>({
  schema,
  prompt,
  content,
  system,
  model = DEFAULT_MODEL,
  maxTokens = 16000,
}: {
  schema: z.ZodType<T>;
  /** Plain-text user message. Ignored if `content` is provided. */
  prompt?: string;
  /** Structured user content blocks (e.g. a PDF document + instruction). */
  content?: Anthropic.MessageParam["content"];
  system?: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const t0 = Date.now();
  let response;
  try {
    response = await getClient().messages.parse({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: content ?? prompt ?? "" }],
      output_config: { format: zodOutputFormat(schema) },
    });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 429) console.warn(`[llm] anthropic 429 (rate-limited) after ${Date.now() - t0}ms`);
    throw e;
  }

  const ms = Date.now() - t0;
  recordUsage({
    provider: "anthropic",
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    ms,
  });
  if (process.env.LLM_DEBUG) {
    console.log(`[llm] ${model} ${ms}ms in=${response.usage?.input_tokens ?? "?"} out=${response.usage?.output_tokens ?? "?"}tok cap=${maxTokens} stop=${response.stop_reason}`);
  }
  if (response.stop_reason === "max_tokens") {
    console.warn(`[llm] ${model} hit max_tokens cap (${maxTokens}) — output truncated`);
  }
  if (!response.parsed_output) {
    throw new Error(
      `Model returned no structured output (stop_reason: ${response.stop_reason}).`,
    );
  }
  return response.parsed_output as T;
}
