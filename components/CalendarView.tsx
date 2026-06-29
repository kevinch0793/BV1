import Link from "next/link";

export type DayEntry = {
  day: number;
  profileId: string;
  profileLabel: string;
  applied: boolean;
  tailored: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Distinct color per profile, assigned by stable profile order (not a hash, so
// adjacent profiles never collide).
const PALETTE = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
  "bg-indigo-100 text-indigo-800",
  "bg-pink-100 text-pink-800",
  "bg-lime-100 text-lime-800",
  "bg-cyan-100 text-cyan-800",
];

export function CalendarView({
  year,
  month,
  entries,
  prevM,
  nextM,
}: {
  year: number;
  month: number;
  entries: DayEntry[];
  prevM: string;
  nextM: string;
}) {
  // day -> profileId -> entries
  const byDay = new Map<number, Map<string, DayEntry[]>>();
  const order: string[] = []; // distinct profileIds in first-seen order
  for (const e of entries) {
    if (!order.includes(e.profileId)) order.push(e.profileId);
    if (!byDay.has(e.day)) byDay.set(e.day, new Map());
    const m = byDay.get(e.day)!;
    if (!m.has(e.profileId)) m.set(e.profileId, []);
    m.get(e.profileId)!.push(e);
  }
  const colorOf = (pid: string) => PALETTE[order.indexOf(pid) % PALETTE.length];

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Activity</h1>
          <p className="text-sm text-neutral-500">Per profile, each day: applied / tailored. Click a day to open that day&apos;s jobs.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/calendar?m=${prevM}`} className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-100">←</Link>
          <span className="min-w-[8rem] text-center text-sm font-medium text-neutral-800">{MONTHS[month]} {year}</span>
          <Link href={`/calendar?m=${nextM}`} className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-100">→</Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="grid grid-cols-7 border-b border-neutral-200 text-center text-xs font-medium text-neutral-500">
          {DOW.map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const profiles = day ? byDay.get(day) : undefined;
            return (
              <div key={i} className="min-h-[120px] border-b border-r border-neutral-100 p-2 [&:nth-child(7n)]:border-r-0">
                {day && (
                  <>
                    <div className="mb-1 text-xs text-neutral-400">{day}</div>
                    <div className="space-y-1">
                      {profiles &&
                        [...profiles.entries()].map(([pid, list]) => {
                          const tailoredCount = list.filter((e) => e.tailored).length;
                          const appliedCount = list.filter((e) => e.applied).length;
                          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
                          return (
                            <Link
                              key={pid}
                              href={`/profiles/${pid}/dashboard?d=${dateStr}`}
                              className={`flex w-full items-center justify-between gap-1 rounded px-1.5 py-1 text-left text-xs font-medium hover:opacity-90 ${colorOf(pid)}`}
                              title={`${list[0].profileLabel} — ${appliedCount} applied / ${tailoredCount} tailored on ${dateStr}`}
                            >
                              <span className="truncate">{list[0].profileLabel}</span>
                              <span className="shrink-0 rounded-full bg-white/70 px-1.5 leading-tight">
                                {appliedCount}/{tailoredCount}
                              </span>
                            </Link>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
