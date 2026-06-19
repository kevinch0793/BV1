import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Lazily-constructed shared client — reads ANTHROPIC_API_KEY from the
// environment. Lazy so importing this module (e.g. during `next build`) doesn't
// require the key to be present; it's only needed when a request runs.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.");
    }
    _client = new Anthropic();
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
  system,
  model = DEFAULT_MODEL,
  maxTokens = 16000,
}: {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const response = await getClient().messages.parse({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (!response.parsed_output) {
    throw new Error(
      `Model returned no structured output (stop_reason: ${response.stop_reason}).`,
    );
  }
  return response.parsed_output as T;
}
