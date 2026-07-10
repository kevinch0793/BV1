"use client";

export function CheckIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ClockIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/**
 * Outcome marker on an event chip: a green check = advanced (moved to next stage),
 * an amber clock = pending (awaiting feedback). Failed is shown by strikethrough at
 * the chip level, so nothing renders here for it (or for an unset status).
 */
export function StatusIcon({ status }: { status: string | null }) {
  if (status === "advanced")
    return (
      <span className="inline-grid h-3.5 w-3.5 shrink-0 place-items-center rounded bg-emerald-100 text-emerald-700" title="Advanced to next stage">
        <CheckIcon />
      </span>
    );
  if (status === "pending")
    return (
      <span className="inline-grid h-3.5 w-3.5 shrink-0 place-items-center rounded bg-amber-100 text-amber-700" title="Awaiting feedback">
        <ClockIcon />
      </span>
    );
  return null;
}
