// Anthropic Message Batches API for bulk resume tailoring: 50% off ALL tokens
// (input, output, cache) at ZERO quality change — same model, same request as the
// sync path (buildTailorParams), just scheduled asynchronously (usually <1h, max
// 24h). This module is pure orchestration (no DB); the pipeline persists results.
import { getClient, parseStructuredMessage } from "@/lib/llm/anthropic";
import { buildTailorParams, finalizeTailored, type TailorArgs } from "@/lib/llm/service";
import { ResumeContentSchema, type ResumeContent } from "@/lib/llm/schema";

export type TailorBatchRequest = { jobId: string; args: TailorArgs };
/** Token usage from a batched tailor (for cost analytics; billed at half rate). */
export type BatchUsage = { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number };
export type TailorBatchResult =
  | { jobId: string; ok: true; content: ResumeContent; usage: BatchUsage }
  | { jobId: string; ok: false; error: string };

/**
 * Submit tailor requests as one Message Batch (custom_id = jobId). Returns the
 * batch id. Anthropic caps a batch at 100k requests / 256MB; callers should chunk
 * (per-profile batches of ~150 are far below that).
 */
export async function createTailorBatch(requests: TailorBatchRequest[]): Promise<string> {
  const batch = await getClient().messages.batches.create({
    requests: requests.map((r) => ({ custom_id: r.jobId, params: buildTailorParams(r.args) })),
  });
  return batch.id;
}

/**
 * Poll a batch until it finishes (processing_status "ended"). Safe to run in the
 * detached pipeline loop. Anthropic guarantees an end within 24h (unfinished
 * requests come back "expired"); the maxWaitMs cap is a backstop against a hang.
 */
export async function waitForBatch(batchId: string, intervalMs = 30_000, maxWaitMs = 26 * 60 * 60 * 1000): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    const b = await getClient().messages.batches.retrieve(batchId);
    if (b.processing_status === "ended") return true;
    if (Date.now() - start > maxWaitMs) return false; // give up polling; results (if any) still fetchable for 29 days
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Stream a finished batch's results, parsing + finalizing each succeeded message
 * into a ResumeContent (the same parse the sync path runs). Keyed by custom_id
 * (= jobId). errored/canceled/expired → an ok:false result the caller can fail.
 */
export async function collectTailorResults(batchId: string): Promise<TailorBatchResult[]> {
  const out: TailorBatchResult[] = [];
  const results = await getClient().messages.batches.results(batchId);
  for await (const item of results) {
    const jobId = item.custom_id;
    const r = item.result;
    if (r.type === "succeeded") {
      try {
        const content = finalizeTailored(parseStructuredMessage(r.message, ResumeContentSchema));
        const u = r.message.usage;
        const usage: BatchUsage = {
          model: r.message.model,
          inputTokens: u?.input_tokens ?? 0,
          outputTokens: u?.output_tokens ?? 0,
          cacheReadTokens: u?.cache_read_input_tokens ?? 0,
        };
        out.push({ jobId, ok: true, content, usage });
      } catch (e) {
        out.push({ jobId, ok: false, error: `parse: ${(e as Error).message}` });
      }
    } else {
      const detail = r.type === "errored" ? JSON.stringify(r.error).slice(0, 200) : r.type;
      out.push({ jobId, ok: false, error: `batch ${r.type}: ${detail}` });
    }
  }
  return out;
}

/**
 * List currently-open (not "ended") tailor batches, for restart recovery — a
 * server restart re-attaches and finishes them (Anthropic keeps results 29 days).
 * Scans recent batches only (open ones are recent).
 */
export async function listOpenBatchIds(): Promise<string[]> {
  const open: string[] = [];
  let scanned = 0;
  for await (const b of getClient().messages.batches.list({ limit: 100 })) {
    if (b.processing_status !== "ended") open.push(b.id);
    if (++scanned >= 300) break; // open batches are recent; don't paginate the whole history
  }
  return open;
}
