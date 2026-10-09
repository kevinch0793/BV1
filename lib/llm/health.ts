import { activeKeySecret, probeKey } from "@/lib/apiKeys";
import { isUsable, type KeyStatus } from "@/lib/apiKeyStatus";

/**
 * Is the LLM key actually usable right now?
 *
 * Every stage of the pipeline goes through OpenAI -- job extraction and JD skills
 * on the extract model, tailoring on the configured model, the extension's
 * answers on another -- so one probe answers for all of them: it is the same key,
 * and it is the first call any job makes.
 *
 * It checks the key the work will ACTUALLY use, which is the active row in
 * ApiKey (see lib/apiKeys), not process.env. Reading the environment directly
 * made this report an exhausted key that nothing was using any more: the banner
 * told users to "proceed without a working API key" and startPipeline refused to
 * start, holding work back, while tailoring on the real key was fine.
 *
 * The probe itself is shared with the admin key screen, so a key can never be
 * Available there and unusable here.
 *
 * A live probe rather than inference from history, because an auth or quota
 * failure never reaches `UsageEvent` (usage is recorded around a SUCCESSFUL
 * call), so there is no past record to read.
 */
export type KeyHealth = {
  ok: boolean;
  /** Why it is unusable, in terms an operator can act on. Never contains the key. */
  reason?: string;
  /** The classified verdict, so a caller can tell billing apart from a bad key. */
  status?: KeyStatus;
  checkedAt: number;
};

/** Long enough that repeated clicks don't re-probe, short enough that a fixed
 *  key is noticed quickly. A key switch invalidates the entry on its own (the
 *  verdict is stored with the secret it was taken on), so this is only a
 *  backstop for a key that changes state without changing value. */
const TTL_MS = 60_000;

/** The verdict is stored WITH the key it was taken on: switching keys makes the
 *  cached answer invalid immediately, however it was switched. */
let cached: (KeyHealth & { secret: string }) | null = null;
let inFlight: Promise<KeyHealth> | null = null;

/** Drop the cached verdict -- used after a key is rotated or switched. */
export function resetKeyHealth(): void {
  cached = null;
}

export async function llmKeyHealth(opts?: { force?: boolean }): Promise<KeyHealth> {
  const secret = await activeKeySecret();
  const fresh = cached && cached.secret === secret && Date.now() - cached.checkedAt < TTL_MS;
  if (!opts?.force && fresh) return cached as KeyHealth;
  // Collapse concurrent callers (several dashboards polling at once) onto one probe.
  if (inFlight) return inFlight;
  inFlight = probe(secret).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function probe(key: string): Promise<KeyHealth> {
  if (!key) {
    cached = {
      ok: false,
      status: "error",
      reason: "No OpenAI API key is set. Add one in Admin > API keys.",
      checkedAt: Date.now(),
      secret: key,
    };
    return cached;
  }
  const { status, detail } = await probeKey(key);
  cached = {
    ok: isUsable(status),
    status,
    reason: isUsable(status) ? undefined : detail,
    checkedAt: Date.now(),
    secret: key,
  };
  return cached;
}
