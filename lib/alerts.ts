/**
 * Operator alerts, for conditions the platform cannot resolve by itself.
 *
 * Deliberately narrow. Key exhaustion is handled automatically by rotating to
 * another key (see rotateToUsableKey), so the only thing worth interrupting
 * someone for is running out of keys entirely -- at which point tailoring,
 * fetching and every extension answer stop at once, and the only symptom a user
 * sees is the extension quietly failing.
 *
 * Delivery is Telegram, because this platform runs on a laptop and its failures
 * are silent: an in-app banner is only read by someone who is already looking,
 * which is exactly when it is not needed.
 *
 * Alerts are stateful rather than per-request. A dead platform fails on every
 * call, so sending per failure would produce hundreds of identical messages; one
 * is sent per episode, re-armed when a key becomes usable again, with a cooldown
 * so a long outage reminds at most occasionally.
 */

const COOLDOWN_MS = 6 * 60 * 60 * 1000;

let armed = true;
let lastSentAt = 0;

/** Called when a usable key appears, so the next outage alerts again. */
export function rearmKeyAlert(): void {
  armed = true;
}

/**
 * Every OpenAI key is unusable. Always logged; delivered to Telegram when it is
 * configured. Never throws -- an alerting failure must not take down the caller.
 */
export async function alertAllKeysExhausted(detail: string): Promise<void> {
  const due = armed || Date.now() - lastSentAt > COOLDOWN_MS;
  console.error(`[alert] every OpenAI key is unusable - ${detail}`);
  if (!due) return;
  armed = false;
  lastSentAt = Date.now();

  const text = [
    "BV1: every OpenAI key is unusable.",
    "",
    detail,
    "",
    "Tailoring, job fetching and extension answers have all stopped.",
    "Add credit or a new key at /admin/keys - work stays pending and resumes on its own.",
  ].join("\n");

  await send(text).catch((e) => {
    console.error("[alert] could not deliver:", e instanceof Error ? e.message : "unknown error");
  });
}

async function send(text: string): Promise<void> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID ?? "").trim();
  if (!token || !chatId) {
    console.error("[alert] not delivered: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to receive these.");
    return;
  }
  // The token is a credential: it goes in the URL because that is the Telegram
  // API shape, and must never reach a log line.
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Report the status only -- the response body echoes the request URL.
    console.error(`[alert] Telegram rejected the message: HTTP ${res.status}`);
  }
}
