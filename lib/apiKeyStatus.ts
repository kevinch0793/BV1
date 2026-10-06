/**
 * How to read an OpenAI probe response, and how to show a key without leaking it.
 *
 * Free of runtime imports so the classification can be asserted directly.
 *
 * The distinction that matters is 401 vs 429: a rejected key needs replacing,
 * while a 429 usually means the ACCOUNT ran out of money and the key itself is
 * perfectly valid. Collapsing the two into "not working" sent this platform
 * chasing key rotation twice when the real fix was billing, so quota exhaustion
 * gets its own status.
 */
export type KeyStatus = "ok" | "revoked" | "no_credit" | "rate_limited" | "error" | "unknown";

/** Is this key usable for real work right now? */
export function isUsable(status: KeyStatus | null | undefined): boolean {
  return status === "ok";
}

export const STATUS_LABEL: Record<KeyStatus, string> = {
  ok: "Available",
  revoked: "Rejected",
  no_credit: "No credit",
  rate_limited: "Rate limited",
  error: "Error",
  unknown: "Not checked",
};

/**
 * Classify a probe. `body` is the raw response text; OpenAI reports quota
 * exhaustion as a 429 whose body carries `insufficient_quota` or
 * `credit_balance_exhausted`, which is the only way to tell it apart from a
 * genuine rate limit.
 */
export function classifyProbe(httpStatus: number, body: string): { status: KeyStatus; detail: string } {
  if (httpStatus >= 200 && httpStatus < 300) return { status: "ok", detail: "Responded normally." };
  const text = (body || "").toLowerCase();
  if (httpStatus === 401) return { status: "revoked", detail: "Key rejected (401) - revoked or mistyped." };
  if (httpStatus === 429) {
    if (text.includes("insufficient_quota") || text.includes("credit_balance_exhausted") || text.includes("no credits remaining")) {
      return { status: "no_credit", detail: "Account is out of credit - the key is valid, the balance is not." };
    }
    return { status: "rate_limited", detail: "Rate limited (429) - too many requests, try again shortly." };
  }
  return { status: "error", detail: `OpenAI returned HTTP ${httpStatus}.` };
}

/** The last 6 characters, which is all the UI ever needs to tell keys apart. */
export function maskKey(secret: string): string {
  const s = (secret || "").trim();
  return s.length <= 6 ? s : s.slice(-6);
}

/** Reject obvious non-keys before storing one. */
export function looksLikeOpenAIKey(secret: string): boolean {
  const s = (secret || "").trim();
  return s.startsWith("sk-") && s.length >= 40 && !/\s/.test(s);
}
