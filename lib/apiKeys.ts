import { prisma } from "@/lib/db";
import { classifyProbe, maskKey, type KeyStatus } from "@/lib/apiKeyStatus";

/**
 * The OpenAI key the platform is currently using, and the live checks behind the
 * admin key switcher.
 *
 * Resolution order is DB-active-row, then OPENAI_API_KEY. The env fallback is
 * what makes this safe to deploy: with an empty table the platform behaves
 * exactly as before, and the first switch takes over without a restart.
 */

/** The cheapest model on the account; a probe asks it for a couple of tokens. */
const PROBE_MODEL = "gpt-4o-mini";

/** Short enough that a switch is picked up promptly, long enough that a busy
 *  pipeline is not querying the key table on every single LLM call. Switching
 *  calls invalidateActiveKey(), so this is only a backstop. */
const CACHE_MS = 30_000;

let cached: { secret: string; at: number } | null = null;

/** Drop the cached key. Called whenever the active row changes. */
export function invalidateActiveKey(): void {
  cached = null;
}

/** The secret to authenticate OpenAI calls with. Empty string if none is set. */
export async function activeKeySecret(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.secret;
  let secret = "";
  try {
    const row = await prisma.apiKey.findFirst({ where: { active: true }, select: { secret: true } });
    secret = row?.secret?.trim() ?? "";
  } catch {
    // Table missing or database busy: fall through to the environment rather
    // than failing every LLM call on an infrastructure hiccup.
  }
  if (!secret) secret = (process.env.OPENAI_API_KEY ?? "").trim();
  cached = { secret, at: Date.now() };
  return secret;
}

/**
 * Ask OpenAI whether this key works, right now.
 *
 * A live call rather than inference from history: an auth or quota failure never
 * reaches UsageEvent (usage is recorded around SUCCESSFUL calls only), so there
 * is no past record that would reveal a dead key.
 */
export async function probeKey(secret: string): Promise<{ status: KeyStatus; detail: string }> {
  if (!secret.trim()) return { status: "error", detail: "No key set." };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: PROBE_MODEL, max_completion_tokens: 2, messages: [{ role: "user", content: "ping" }] }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = res.ok ? "" : await res.text().catch(() => "");
    return classifyProbe(res.status, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { status: "error", detail: `Could not reach OpenAI: ${msg}` };
  }
}

/** Probe one stored key and persist the verdict. Returns the fresh status. */
export async function refreshKeyStatus(id: string): Promise<{ status: KeyStatus; detail: string }> {
  const row = await prisma.apiKey.findUnique({ where: { id }, select: { secret: true } });
  if (!row) return { status: "error", detail: "Key not found." };
  const result = await probeKey(row.secret);
  await prisma.apiKey.update({
    where: { id },
    data: { lastStatus: result.status, lastDetail: result.detail, lastCheckedAt: new Date() },
  });
  return result;
}

/**
 * Copy OPENAI_API_KEY into the table the first time the admin page is opened, so
 * the key already in use appears in the list instead of the page looking empty
 * while the platform is plainly working.
 */
export async function seedFromEnvIfEmpty(): Promise<void> {
  const envKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!envKey) return;
  const count = await prisma.apiKey.count();
  if (count > 0) return;
  await prisma.apiKey.create({
    data: { label: "From .env", secret: envKey, last6: maskKey(envKey), active: true },
  });
  invalidateActiveKey();
}
