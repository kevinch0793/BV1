import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/db";

// Per-operation context carried alongside an LLM call so the SDK wrappers can
// record who/what it was for WITHOUT threading params through every function.
// Set at the pipeline / answer / manual-tailor entry points via withUsage(); the
// Anthropic + OpenAI wrappers read it in recordUsage() and write a UsageEvent.
export type UsageCtx = { clientId: string | null; profileId?: string | null; jobId?: string | null; kind: string };

const store = new AsyncLocalStorage<UsageCtx>();

/** Run `fn` with a usage context so LLM calls inside it are attributed + recorded. */
export function withUsage<T>(ctx: UsageCtx, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

/** Re-tag the current context's kind for a sub-operation (inherits the ids). No-op
 *  outside a context. E.g. label the JD-skills extract inside a tailor as "jd_skills". */
export function withKind<T>(kind: string, fn: () => Promise<T>): Promise<T> {
  const ctx = store.getStore();
  return ctx ? store.run({ ...ctx, kind }, fn) : fn();
}

/**
 * Record one LLM call's usage. No-op when there's no active context (e.g. a build-
 * time or untracked call) or no clientId — so recording never breaks a request.
 * Fire-and-forget: a failed insert must not affect the LLM response.
 */
export function recordUsage(u: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  /** Override the context kind (e.g. "jd_skills" for the ATS sub-call). */
  kind?: string;
}): void {
  const ctx = store.getStore();
  if (!ctx || !ctx.clientId) return;
  void prisma.usageEvent
    .create({
      data: {
        clientId: ctx.clientId,
        profileId: ctx.profileId ?? null,
        jobId: ctx.jobId ?? null,
        kind: u.kind ?? ctx.kind,
        provider: u.provider,
        model: u.model,
        inputTokens: Math.max(0, Math.round(u.inputTokens || 0)),
        outputTokens: Math.max(0, Math.round(u.outputTokens || 0)),
        ms: Math.max(0, Math.round(u.ms || 0)),
      },
    })
    .catch(() => {});
}
