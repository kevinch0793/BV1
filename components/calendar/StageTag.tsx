"use client";

import { stageOf } from "@/lib/calendar";

/** Small colored badge showing an event's interview stage (Intro / HR / Tech / …). */
export function StageTag({ step, className = "" }: { step: string | null; className?: string }) {
  const st = stageOf(step);
  if (!st) return null;
  return <span className={`inline-block shrink-0 rounded px-1 text-[9px] font-semibold leading-tight ${st.badge} ${className}`}>{st.label}</span>;
}
