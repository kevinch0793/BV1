"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProfilePaused } from "@/app/actions/pipeline";

// Stop/play control on a profile card's top-LEFT corner (opposite the template
// badge). Admins get an interactive toggle: a stop icon while running (click to
// pause) and a play icon while paused (click to resume). Non-admins see a static
// "Paused" pill only when paused (so they understand why add/retry are disabled).
export function ProfilePauseButton({ profileId, paused, isAdmin }: { profileId: string; paused: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!isAdmin) {
    if (!paused) return null;
    return (
      <div className="absolute -top-2.5 left-3 z-10">
        <span className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 shadow-sm">
          <PlayIcon /> Paused
        </span>
      </div>
    );
  }

  return (
    <div className="absolute -top-2.5 left-3 z-10" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        title={paused ? "Paused — click to resume this profile" : "Running — click to pause this profile"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setProfilePaused(profileId, !paused);
            router.refresh();
          })
        }
        className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium shadow-sm focus:outline-none disabled:opacity-50 ${
          paused
            ? "border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400"
            : "border-neutral-300 bg-white text-neutral-600 hover:border-sky-400"
        }`}
      >
        {paused ? <PlayIcon /> : <StopIcon />}
        {paused ? "Paused" : "Running"}
      </button>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true">
      <path d="M3 2.5v7l6-3.5-6-3.5z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1" />
    </svg>
  );
}
