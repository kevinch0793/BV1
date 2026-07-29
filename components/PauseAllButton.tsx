"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAllPaused } from "@/app/actions/pipeline";

// Admin-only header control: pause or resume EVERY profile at once. Label flips
// based on whether all profiles are currently paused.
export function PauseAllButton({ allPaused }: { allPaused: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setAllPaused(!allPaused);
          router.refresh();
        })
      }
      className={`rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
        allPaused
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
      }`}
    >
      {pending ? "…" : allPaused ? "Resume all" : "Pause all"}
    </button>
  );
}
