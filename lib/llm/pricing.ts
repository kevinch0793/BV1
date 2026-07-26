// Estimated model pricing (USD per 1M tokens). Used only for the admin usage
// dashboard's cost estimate — labelled "est." there since provider prices change.
// Anthropic figures confirmed against the claude-api skill; OpenAI from public pricing.
type Price = { inPer1M: number; outPer1M: number };

export const MODEL_PRICES: Record<string, Price> = {
  // Anthropic
  "claude-sonnet-4-6": { inPer1M: 3, outPer1M: 15 },
  "claude-opus-4-8": { inPer1M: 5, outPer1M: 25 },
  // OpenAI
  "gpt-4o": { inPer1M: 2.5, outPer1M: 10 },
  "gpt-4o-mini": { inPer1M: 0.15, outPer1M: 0.6 },
};

/** Estimated USD cost of a call. Returns 0 for unknown models (shown as "—"). */
export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICES[model];
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.inPer1M + (outputTokens / 1_000_000) * p.outPer1M;
}

/** True when we have a price for this model (so the UI can show "—" otherwise). */
export function hasPrice(model: string): boolean {
  return model in MODEL_PRICES;
}
