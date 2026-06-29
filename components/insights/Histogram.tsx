"use client";

import { fitColor } from "@/lib/fit";
import { FIT_BUCKETS } from "@/lib/insights";

/** ATS-fit distribution. `buckets` aligns to FIT_BUCKETS; bars tinted by fitColor
 *  so everything below 60 reads red and above ramps green (the threshold shows
 *  itself through color). */
export function Histogram({ buckets }: { buckets: number[] }) {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="py-10 text-center text-sm text-neutral-400">No tailored resumes scored yet.</p>;
  const max = Math.max(1, ...buckets);
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: 140 }}>
        {buckets.map((c, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] text-neutral-500">{c || ""}</span>
            <div
              className="w-full rounded-t"
              style={{ height: c > 0 ? `${(c / max) * 100}%` : "0", minHeight: c > 0 ? 4 : 0, backgroundColor: fitColor(FIT_BUCKETS[i].mid).bg }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 border-t border-neutral-100 pt-1">
        {FIT_BUCKETS.map((b, i) => (
          <span key={i} className="flex-1 text-center text-[9px] text-neutral-400">{b.label}</span>
        ))}
      </div>
    </div>
  );
}
