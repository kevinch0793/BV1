"use client";

import { useTransition } from "react";

/**
 * Enable or disable one profile from the admin table.
 *
 * "Disabled" is the `paused` flag, which already blocks every entry point: the
 * pipeline start and each loop round, the tailor step, adding URLs, pasting a JD
 * and retries. New profiles are created disabled, so nothing a client sets up
 * can spend on the API until an admin turns it on.
 *
 * Enabling also re-queues that profile's failed-but-fetched jobs and starts its
 * pipeline (see setProfilePaused), so a profile enabled after a backlog built up
 * begins working immediately rather than waiting for the next sweep.
 */
export function ProfileEnableToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (paused: boolean) => Promise<unknown>;
}) {
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      title={
        enabled
          ? "Enabled — this profile can add, fetch and tailor jobs. Click to disable."
          : "Disabled — no jobs can be added, fetched or tailored. Click to enable."
      }
      onClick={() =>
        start(async () => {
          await onChange(enabled); // currently enabled → pause it, and vice versa
        })
      }
      className={`rounded-md border px-1.5 py-0.5 text-xs font-medium disabled:opacity-50 ${
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-neutral-300 bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
      }`}
    >
      {busy ? "…" : enabled ? "Enabled" : "Disabled"}
    </button>
  );
}
