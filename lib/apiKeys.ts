import { prisma } from "@/lib/db";
import { classifyProbe, maskKey, type KeyStatus } from "@/lib/apiKeyStatus";
import { alertAllKeysExhausted, rearmKeyAlert } from "@/lib/alerts";

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

/**
 * The active key cannot work -- promote the first stored key that can.
 *
 * Called when a real OpenAI call fails with an exhausted or rejected key, so the
 * platform recovers without anyone watching. Running out of credit used to stop
 * every pipeline and every extension answer until someone noticed and switched
 * by hand, which in practice meant a user reporting it hours later.
 *
 * Returns true if a usable key is now active. When nothing is usable it raises
 * the operator alert and returns false; callers should surface the original
 * error, leaving work pending for the next sweep to retry.
 *
 * Concurrency: a busy pipeline fails many calls at once, and each would
 * otherwise probe every key. One rotation runs at a time and the rest await its
 * result, so a rotation costs one pass over the keys however many callers hit it.
 */
let rotation: Promise<boolean> | null = null;

export async function rotateToUsableKey(reason: string): Promise<boolean> {
  if (rotation) return rotation;
  rotation = doRotate(reason).finally(() => {
    rotation = null;
  });
  return rotation;
}

async function doRotate(reason: string): Promise<boolean> {
  const keys = await prisma.apiKey.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: { id: true, label: true, secret: true, active: true },
  });
  const current = keys.find((k) => k.active);

  // Record why the current key was abandoned, so /admin/keys explains itself.
  if (current) {
    await prisma.apiKey
      .update({
        where: { id: current.id },
        data: { lastStatus: reason === "revoked" ? "revoked" : "no_credit", lastDetail: `Switched away automatically: ${reason}`, lastCheckedAt: new Date() },
      })
      .catch(() => undefined);
  }

  for (const candidate of keys) {
    if (candidate.active) continue;
    const probe = await probeKey(candidate.secret);
    await prisma.apiKey
      .update({
        where: { id: candidate.id },
        data: { lastStatus: probe.status, lastDetail: probe.detail, lastCheckedAt: new Date() },
      })
      .catch(() => undefined);
    if (probe.status !== "ok") continue;

    await prisma.apiKey.updateMany({ where: { active: true }, data: { active: false } });
    await prisma.apiKey.update({ where: { id: candidate.id }, data: { active: true } });
    invalidateActiveKey();
    rearmKeyAlert();
    console.warn(`[keys] ${current?.label ?? "active key"} is ${reason}; switched to ${candidate.label}`);
    return true;
  }

  await alertAllKeysExhausted(
    `${current?.label ?? "The active key"} is ${reason}, and no other stored key is usable (${keys.length} checked).`,
  );
  return false;
}
