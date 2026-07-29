import Anthropic from "@anthropic-ai/sdk";
import { Agent } from "undici";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { parseMessage } from "@anthropic-ai/sdk/lib/parser";
import { z } from "zod";
import { recordUsage } from "@/lib/llm/usage";

// Lazily-constructed shared client — reads ANTHROPIC_API_KEY from the
// environment. Lazy so importing this module (e.g. during `next build`) doesn't
// require the key to be present; it's only needed when a request runs.
let _client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.");
    }
    // Give the Anthropic client its OWN undici connection pool. Under the Next.js
    // server runtime, Node's global fetch dispatcher funnels all requests onto a
    // single keep-alive connection, so concurrent (non-streaming) tailor calls
    // SERIALIZE — each waits in a queue INSIDE fetch() for the one connection,
    // turning a ~15s call into minutes once the queue is deep. A dedicated pool
    // lets concurrent tailors run in parallel. Proven: 1 connection → 8 calls take
    // 13→120s (serialized); a 20-connection pool → ~13s each (parallel).
    // maxRetries 4 keeps transient 429s self-healing.
    _client = new Anthropic({
      maxRetries: 4,
      fetchOptions: { dispatcher: new Agent({ connections: 32 }) },
    });
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

/** Options for a structured-output completion (shared by the sync + batch paths). */
export type StructuredOpts<T> = {
  schema: z.ZodType<T>;
  /** Plain-text user message. Ignored if `content` is provided. */
  prompt?: string;
  /** Structured user content blocks (e.g. a PDF document + instruction). */
  content?: Anthropic.MessageParam["content"];
  /**
   * A static leading chunk of the USER message to prompt-cache (e.g. the
   * candidate profile + base resume, identical across all of one profile's jobs).
   * When set, the user message becomes [cached prefix, then `prompt`], so repeat
   * calls bill the prefix as a cache read. Byte-identical content — only its
   * position (first) and the cache hint change.
   */
  cachePrefix?: string;
  system?: string;
  model?: string;
  maxTokens?: number;
};

/**
 * Build the exact Messages request for a structured completion. Shared by the
 * synchronous `generateStructured` AND the Batch API path, so both send
 * BYTE-IDENTICAL requests (same model/prompt/params → same output). The prompt
 * cache (system + optional user prefix) lives here, so batched jobs cache too.
 */
export function buildStructuredParams<T>({
  schema,
  prompt,
  content,
  cachePrefix,
  system,
  model = DEFAULT_MODEL,
  maxTokens = 16000,
}: StructuredOpts<T>): Anthropic.MessageCreateParamsNonStreaming {
  // Cache the (large, static) system prompt so repeat calls bill it as a cache
  // READ (~10% cost) instead of fresh input. Caching is transparent — the model
  // gets the identical prompt, so output is byte-for-byte the same. Anthropic
  // ignores cache_control on sub-threshold blocks.
  // ttl "1h" (vs the 5m default): the fair scheduler interleaves ~10 profiles, so
  // a profile's jobs are spaced past 5m and would keep re-paying cache WRITES. A
  // 1h TTL (2x write, paid once) keeps each profile's prefix warm across all its
  // ~150 jobs — every read (0.1x) re-arms the hour for free. Quality-neutral.
  const systemParam: Array<Anthropic.TextBlockParam> | undefined = system
    ? [{ type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } }]
    : undefined;
  // When a cachePrefix is given, split the user message into [cached static block,
  // dynamic block] so repeat calls with the same prefix bill it as a cache read.
  const userContent: Anthropic.MessageParam["content"] =
    cachePrefix != null
      ? [
          { type: "text", text: cachePrefix, cache_control: { type: "ephemeral", ttl: "1h" } },
          { type: "text", text: prompt ?? "" },
        ]
      : (content ?? prompt ?? "");
  return {
    model,
    max_tokens: maxTokens,
    system: systemParam,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(schema) },
  };
}

/**
 * Parse a raw Message (e.g. a Batch API result) into the schema's structured
 * output — the same logic `messages.parse()` runs inline. The batch endpoint
 * returns raw messages, so we run the SDK's public parser ourselves.
 */
export function parseStructuredMessage<T>(message: Anthropic.Message, schema: z.ZodType<T>): T {
  // parseMessage only reads params.output_config; build a valid params object.
  const params = buildStructuredParams({ schema, prompt: "" });
  const parsed = parseMessage(message, params, { logger: console });
  if (!parsed.parsed_output) {
    throw new Error(`Structured result had no parsed output (stop_reason: ${message.stop_reason}).`);
  }
  return parsed.parsed_output as T;
}

/**
 * Run a single structured-output completion. Uses messages.parse + a Zod output
 * format, so the model is forced to return JSON matching `schema` (validated at
 * the SDK layer — it retries on mismatch). Throws if no valid output comes back.
 */
export async function generateStructured<T>(opts: StructuredOpts<T>): Promise<T> {
  const { model = DEFAULT_MODEL, maxTokens = 16000 } = opts;
  const t0 = Date.now();
  const params = buildStructuredParams(opts);
  // IMPORTANT: messages.parse() returns a PLAIN promise at runtime — it is
  // create().then(parseMessage), NOT an APIPromise — even though the .d.ts types
  // it as APIPromise. So `.withResponse()` is undefined at runtime and MUST NOT be
  // chained here (it throws "withResponse is not a function" and fails every call).
  let response;
  try {
    response = await getClient().messages.parse(params);
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
  // Cache-hit visibility (cache_read > 0 on the 2nd+ tailor of a burst confirms the
  // prompt cache is live). Ratelimit headers would need .withResponse() (unavailable
  // on parse()), so we log the usage-based cache tokens only.
  if (process.env.LLM_DEBUG) {
    console.log(
      `[llm] ${model} ${ms}ms in=${response.usage?.input_tokens ?? "?"} out=${response.usage?.output_tokens ?? "?"} cache_read=${response.usage?.cache_read_input_tokens ?? 0} cache_write=${response.usage?.cache_creation_input_tokens ?? 0} cap=${maxTokens} stop=${response.stop_reason}`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    console.warn(`[llm] ${model} hit max_tokens cap (${maxTokens}) — output truncated`);
  }
  if (!response.parsed_output) {
    throw new Error(`Model returned no structured output (stop_reason: ${response.stop_reason}).`);
  }
  return response.parsed_output as T;
}
