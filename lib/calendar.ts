// Pure helpers + types for the manual calendar. Dates are wall-clock
// "YYYY-MM-DD" strings and times are "HH:MM" (24h) — a calendar day/time is a
// label, not an instant, so no timezone math.

export type CalEvent = {
  id: string;
  profileId: string | null;
  title: string;
  date: string; // start day "YYYY-MM-DD"
  endDate: string | null; // end day for multi-day all-day events
  allDay: boolean;
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  location: string | null;
  note: string | null;
  color: string;
};

export type EventInput = {
  title: string;
  date: string;
  endDate: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  note: string | null;
  color: string;
  profileId: string | null;
};

export const EVENT_COLORS = [
  { id: "sky", name: "Blue", bg: "bg-sky-500", soft: "bg-sky-100 text-sky-800", border: "border-sky-500" },
  { id: "emerald", name: "Green", bg: "bg-emerald-500", soft: "bg-emerald-100 text-emerald-800", border: "border-emerald-500" },
  { id: "violet", name: "Purple", bg: "bg-violet-500", soft: "bg-violet-100 text-violet-800", border: "border-violet-500" },
  { id: "rose", name: "Red", bg: "bg-rose-500", soft: "bg-rose-100 text-rose-800", border: "border-rose-500" },
  { id: "amber", name: "Amber", bg: "bg-amber-500", soft: "bg-amber-100 text-amber-800", border: "border-amber-500" },
  { id: "teal", name: "Teal", bg: "bg-teal-500", soft: "bg-teal-100 text-teal-800", border: "border-teal-500" },
  { id: "pink", name: "Pink", bg: "bg-pink-500", soft: "bg-pink-100 text-pink-800", border: "border-pink-500" },
  { id: "neutral", name: "Gray", bg: "bg-neutral-500", soft: "bg-neutral-200 text-neutral-700", border: "border-neutral-500" },
];
export const colorOf = (id: string) => EVENT_COLORS.find((c) => c.id === id) ?? EVENT_COLORS[0];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}
function toDate(s: string): Date {
  const { y, m, d } = parseYmd(s);
  return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number): string {
  const dt = toDate(s);
  return ymd(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n));
}
export function addMonths(s: string, n: number): string {
  const { y, m } = parseYmd(s);
  return ymd(new Date(y, m - 1 + n, 1));
}
export function dowOf(s: string): number {
  return toDate(s).getDay();
}

/** 6 weeks × 7 days of "YYYY-MM-DD" covering the month of `s` (Sunday-start). */
export function monthMatrix(s: string): string[][] {
  const { y, m } = parseYmd(s);
  const first = new Date(y, m - 1, 1);
  const gridStart = new Date(y, m - 1, 1 - first.getDay());
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let d = 0; d < 7; d++) row.push(ymd(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d)));
    weeks.push(row);
  }
  return weeks;
}

/** The 7 days (Sun..Sat) of the week containing `s`. */
export function weekDays(s: string): string[] {
  const start = addDays(s, -dowOf(s));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthTitle(s: string): string {
  const { y, m } = parseYmd(s);
  return `${MONTHS[m - 1]} ${y}`;
}
export function weekTitle(s: string): string {
  const days = weekDays(s);
  const a = parseYmd(days[0]);
  const b = parseYmd(days[6]);
  if (a.m === b.m) return `${MONTHS_SHORT[a.m - 1]} ${a.d} – ${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MONTHS_SHORT[a.m - 1]} ${a.d} – ${MONTHS_SHORT[b.m - 1]} ${b.d}, ${a.y}`;
  return `${MONTHS_SHORT[a.m - 1]} ${a.d}, ${a.y} – ${MONTHS_SHORT[b.m - 1]} ${b.d}, ${b.y}`;
}
export function longDate(s: string): string {
  const { m, d, y } = parseYmd(s);
  return `${WEEKDAYS[dowOf(s)]}, ${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

/** "14:30" -> "2:30 PM"; "09:00" -> "9 AM". */
export function fmtTime(hm: string | null | undefined): string {
  if (!hm) return "";
  const [h, m] = hm.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ap}` : `${h12}:${pad(m)} ${ap}`;
}
export const minutesOf = (hm: string | null | undefined): number => {
  if (!hm) return 0;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Does an event fall on `day`? (all-day events span date..endDate.) */
export function onDay(e: CalEvent, day: string): boolean {
  if (e.allDay) {
    const end = e.endDate && e.endDate >= e.date ? e.endDate : e.date;
    return day >= e.date && day <= end;
  }
  return e.date === day;
}

/** Sort for a day: all-day first, then by start time, then title. */
export function cmpEvent(a: CalEvent, b: CalEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return minutesOf(a.startTime) - minutesOf(b.startTime) || a.title.localeCompare(b.title);
}
