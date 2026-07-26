// Formatting helpers for the admin usage dashboard (pure — safe on client + server).

/** 12 → "12", 3_400 → "3.4K", 2_500_000 → "2.5M". */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

/** 0 → "—" (unknown pricing), 1.234 → "$1.23", 0.004 → "<$0.01". */
export function fmtCost(usd: number): string {
  if (usd <= 0) return "—";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

/** 950 → "0.9s", 74210 → "74s". */
export function fmtMs(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}
