import { OPENAI_EXTRACT_MODEL } from "@/lib/llm/openai";

/**
 * Is the LLM key actually usable right now?
 *
 * Every stage of the pipeline goes through OpenAI — job extraction and JD skills
 * on the extract model, tailoring on the configured model, the extension's
 * answers on another — so one probe against the extract model answers for all of
 * them: it is the same key, and it is the first call any job makes.
 *
 * A live probe rather than inference from history, because an auth failure never
 * reaches `UsageEvent` (usage is recorded around a SUCCESSFUL call), so there is
 * no past record to read. The probe asks for one token, which is free in
 * practice.
 */
export type KeyHealth = {
  ok: boolean;
  /** HTTP status, when the request reached OpenAI at all. */
  status?: number;
  /** Short reason, safe to show a user — never contains the key. */
  reason?: string;
  checkedAt: number;
};

/** Long enough that repeated clicks don't re-probe, short enough that a fixed
 *  key is noticed quickly. A key change also restarts the app, clearing this. */
const TTL_MS = 60_000;

let cached: KeyHealth | null = null;
let inFlight: Promise<KeyHealth> | null = null;

/** Drop the cached verdict — used after a key is rotated. */
export function resetKeyHealth(): void {
  cached = null;
}

export async function llmKeyHealth(opts?: { force?: boolean }): Promise<KeyHealth> {
  if (!opts?.force && cached && Date.now() - cached.checkedAt < TTL_MS) return cached;
  // Collapse concurrent callers (several dashboards polling at once) onto one probe.
  if (inFlight) return inFlight;
  inFlight = probe().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function probe(): Promise<KeyHealth> {
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) {
    cached = { ok: false, reason: "No OPENAI_API_KEY is configured.", checkedAt: Date.now() };
    return cached;
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: OPENAI_EXTRACT_MODEL, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      cached = { ok: true, status: res.status, checkedAt: Date.now() };
      return cached;
    }
    // Distinguish the two failures an operator acts on differently: a rejected
    // key needs rotating, a 429 just needs waiting.
    const reason =
      res.status === 401
        ? "The OpenAI API key was rejected (401) — it has been revoked or is wrong."
        : res.status === 429
          ? "OpenAI is rate-limiting or the account is out of quota (429)."
          : `OpenAI returned HTTP ${res.status}.`;
    cached = { ok: false, status: res.status, reason, checkedAt: Date.now() };
    return cached;
  } catch (e) {
    // Network/timeout: not necessarily a bad key, but work cannot proceed either.
    cached = {
      ok: false,
      reason: `Could not reach OpenAI: ${e instanceof Error ? e.message : "unknown error"}.`,
      checkedAt: Date.now(),
    };
    return cached;
  }
}
