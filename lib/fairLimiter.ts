// A max-min fair concurrency limiter. At most `cap` tasks run at once; each freed
// slot goes to the waiting KEY that currently holds the FEWEST slots (ties: the
// earliest to start waiting, since each key's waiters are a FIFO). So one key that
// queues 500 tasks can't starve a key with 8 — every active key converges to a
// roughly equal share — while a lone key still uses the whole cap (no waste).
//
// Factored verbatim from the pipeline's original per-profile job scheduler so the
// same fairness can gate a *second*, scarcer resource: the Anthropic tailor call.
// The global job pool keys on profileId; the tailor pool keys on profileId too, so
// the limited tailor permits are split evenly across the profiles that want them.
export class FairLimiter {
  private readonly cap: number;
  private active = 0;
  private readonly activeByKey = new Map<string, number>(); // key -> slots currently in use
  private readonly waitQueues = new Map<string, Array<() => void>>(); // key -> FIFO of slot-grant callbacks

  constructor(cap: number) {
    this.cap = Math.max(1, cap);
  }

  /** Number of tasks currently running (for tests / introspection). */
  get inFlight(): number {
    return this.active;
  }

  // The waiting key holding the fewest slots (ties: earliest to start waiting).
  private fewestLoadedWaiting(): string | null {
    let best: string | null = null;
    let bestActive = Infinity;
    for (const [key, q] of this.waitQueues) {
      if (!q.length) continue;
      const a = this.activeByKey.get(key) ?? 0;
      if (a < bestActive) {
        bestActive = a;
        best = key;
      }
    }
    return best;
  }

  // Grant slots to waiting keys (fairest first) until the cap is hit.
  private pump(): void {
    while (this.active < this.cap) {
      const key = this.fewestLoadedWaiting();
      if (!key) break;
      const q = this.waitQueues.get(key)!;
      const grant = q.shift()!;
      if (!q.length) this.waitQueues.delete(key);
      this.active++;
      this.activeByKey.set(key, (this.activeByKey.get(key) ?? 0) + 1);
      grant(); // wake the waiter — its slot is already accounted for
    }
  }

  /**
   * Run `fn` once a fair slot is free, then release the slot (even if `fn`
   * throws). `key` is the fairness bucket — tasks with the same key share a FIFO
   * and compete as one profile for an equal share of `cap`.
   */
  async withSlot<T>(key: string, fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const q = this.waitQueues.get(key);
      if (q) q.push(resolve);
      else this.waitQueues.set(key, [resolve]);
      this.pump();
    });
    try {
      return await fn();
    } finally {
      this.active--;
      const left = (this.activeByKey.get(key) ?? 1) - 1;
      if (left <= 0) this.activeByKey.delete(key);
      else this.activeByKey.set(key, left);
      this.pump();
    }
  }
}
