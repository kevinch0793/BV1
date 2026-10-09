import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { recordUsage } from "@/lib/llm/usage";
import { activeKeySecret, rotateToUsableKey } from "@/lib/apiKeys";
import { classifyThrown, shouldRotate } from "@/lib/apiKeyStatus";

// Two lazily-constructed OpenAI clients, so resume TAILORING can bill to a
// different account than the cheap, high-volume extraction work:
//   "extract" → OPENAI_API_KEY        — resume + JD parsing, ATS skills (gpt-4o-mini)
//   "tailor"  → OPENAI_TAILOR_API_KEY — tailoring, when a GPT model is the globally
//                                       selected tailoring model (see lib/settings.ts)
// OPENAI_TAILOR_API_KEY is OPTIONAL: when it's unset or empty, tailoring falls back
// to OPENAI_API_KEY, so nothing changes until a separate key is actually added.
// Both are read from process.env at request time (no NEXT_PUBLIC_ prefix → never
// inlined at build time), so swapping a key only needs a server restart.
export type OpenAIKeyPurpose = "extract" | "tailor";

let _client: OpenAI | null = null;
// The secret _client was built with, so a key switched in the admin UI is noticed.
let _clientSecret = "";
let _tailorClient: OpenAI | null = null;

async function getClient(purpose: OpenAIKeyPurpose = "extract"): Promise<OpenAI> {
  if (purpose === "tailor") {
    const tailorKey = process.env.OPENAI_TAILOR_API_KEY?.trim();
    // Pass the key EXPLICITLY — the SDK's implicit `new OpenAI()` only ever reads
    // OPENAI_API_KEY, so a dedicated tailoring key must be handed in by hand.
    if (tailorKey) {
      if (!_tailorClient) _tailorClient = new OpenAI({ apiKey: tailorKey });
      return _tailorClient;
    }
    // No dedicated key set → fall through and share the extraction key.
  }
  // The active key is chosen in Admin > API keys and falls back to
  // OPENAI_API_KEY, so an empty key table behaves exactly as before.
  const secret = await activeKeySecret();
  if (!secret) {
    throw new Error("No OpenAI API key is set — add one in Admin > API keys, or set OPENAI_API_KEY.");
  }
  // Rebuild when the secret changes so switching a key takes effect on the next
  // call rather than waiting for a restart.
  if (!_client || _clientSecret !== secret) {
    _client = new OpenAI({ apiKey: secret });
    _clientSecret = secret;
  }
  return _client;
}

/**
 * Does this purpose use the key managed in Admin > API keys?
 *
 * A dedicated OPENAI_TAILOR_API_KEY comes from the environment and is outside
 * the switcher, so rotating the managed key could not fix a failure on it and
 * the retry would fail identically.
 */
function usesManagedKey(purpose: OpenAIKeyPurpose): boolean {
  return !(purpose === "tailor" && !!process.env.OPENAI_TAILOR_API_KEY?.trim());
}

export const OPENAI_EXTRACT_MODEL = process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4o-mini";
export const OPENAI_TAILOR_MODEL = process.env.OPENAI_TAILOR_MODEL ?? "gpt-4o";

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
  keyPurpose = "extract",
}: {
  schema: z.ZodType<T>;
  schemaName: string;
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  /** Which API key to bill this call to. Defaults to the shared extraction key. */
  keyPurpose?: OpenAIKeyPurpose;
}): Promise<T> {
  const call = async () =>
    (await getClient(keyPurpose)).chat.completions.parse({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: prompt },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    });

  const t0 = Date.now();
  let completion: Awaited<ReturnType<typeof call>>;
  try {
    completion = await call();
  } catch (e) {
    // An exhausted or rejected key is the one failure another key can fix, and
    // it otherwise stops every pipeline and every extension answer until someone
    // notices by hand. Rotate and retry ONCE: getClient rebuilds on the new
    // secret, and a second failure is reported normally so the job stays pending
    // rather than looping.
    const status = classifyThrown(e);
    if (!usesManagedKey(keyPurpose) || !shouldRotate(status)) throw e;
    if (!(await rotateToUsableKey(status))) throw e;
    completion = await call();
  }
  recordUsage({
    provider: "openai",
    model,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
    ms: Date.now() - t0,
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI refused: ${message.refusal}`);
  if (!message?.parsed) throw new Error("OpenAI returned no structured output.");
  return message.parsed as T;
}
