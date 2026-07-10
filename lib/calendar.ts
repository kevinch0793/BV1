// Pure helpers + types for the manual calendar. Dates are wall-clock
// "YYYY-MM-DD" strings and times are "HH:MM" (24h) — a calendar day/time is a
// label, not an instant, so no timezone math.

export type MeetingType = "phone" | "video" | null;

export type CalEvent = {
  id: string;
  profileId: string | null;
  company: string; // company we're interviewing with (shown on the calendar bar)
  role: string | null; // role we're applying to
  date: string; // start day "YYYY-MM-DD"
  endDate: string | null; // end day for multi-day all-day events
  allDay: boolean;
  startTime: string | null; // "HH:MM" (in `timeZone`)
  endTime: string | null;
  timeZone: string | null; // IANA zone the wall-clock date/start/end are anchored to
  note: string | null;
  meetingType: MeetingType; // interview call type
  meetingLink: string | null; // video link, when meetingType = "video"
  step: string | null; // interview stage id (see EVENT_STAGES)
  status: string | null; // interview outcome id (see EVENT_OUTCOMES)
  color: string;
};

export type EventInput = {
  company: string;
  role: string | null;
  date: string;
  endDate: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  timeZone: string | null;
  note: string | null;
  meetingType: MeetingType;
  meetingLink: string | null;
  step: string | null;
  status: string | null;
  color: string;
  profileId: string | null;
};

// Interview pipeline stages, shown as a tag on each event.
export const EVENT_STAGES = [
  { id: "intro", label: "Intro", badge: "bg-neutral-200 text-neutral-700" },
  { id: "hr", label: "HR", badge: "bg-sky-100 text-sky-700" },
  { id: "tech", label: "Tech", badge: "bg-violet-100 text-violet-700" },
  { id: "onsite", label: "Onsite", badge: "bg-amber-100 text-amber-700" },
  { id: "final", label: "Final", badge: "bg-emerald-100 text-emerald-700" },
  { id: "offer", label: "Offer", badge: "bg-rose-100 text-rose-700" },
];
export const stageOf = (id: string | null | undefined) => EVENT_STAGES.find((s) => s.id === id) ?? null;

// Interview OUTCOME per event — just failed or not. A failed interview renders
// struck-through + faded on the calendar.
export const EVENT_OUTCOMES = [{ id: "failed", label: "Failed" }];
export const outcomeOf = (id: string | null | undefined) => EVENT_OUTCOMES.find((o) => o.id === id) ?? null;

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
  return minutesOf(a.startTime) - minutesOf(b.startTime) || a.company.localeCompare(b.company);
}

// ---- second-timezone support (Google-Calendar-style) ----

export const localTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A time zone's offset from UTC (minutes) at a given instant — DST-aware. */
export function tzOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** 24 hour labels for `secondaryTz`, aligned to the `primaryTz` hour rows of `refDay`. */
export function secondaryHourLabels(primaryTz: string, secondaryTz: string, refDay: string): string[] {
  const { y, m, d } = parseYmd(refDay);
  const ref = new Date(y, m - 1, d, 0, 0);
  let delta = 0;
  try {
    delta = tzOffsetMinutes(secondaryTz, ref) - tzOffsetMinutes(primaryTz, ref);
  } catch {
    return Array.from({ length: 24 }, () => "");
  }
  return Array.from({ length: 24 }, (_, h) => {
    const min = (((h * 60 + delta) % 1440) + 1440) % 1440;
    return fmtTime(`${pad(Math.floor(min / 60))}:${pad(min % 60)}`);
  });
}

/** A short label for a zone, e.g. "PDT" or "GMT+1". */
export function tzShort(timeZone: string, refDay: string): string {
  const { y, m, d } = parseYmd(refDay);
  const ref = new Date(y, m - 1, d, 12, 0);
  try {
    const tz = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(ref).find((p) => p.type === "timeZoneName")?.value;
    if (tz) return tz;
    const off = tzOffsetMinutes(timeZone, ref);
    const a = Math.abs(off);
    return `GMT${off >= 0 ? "+" : "-"}${Math.floor(a / 60)}${a % 60 ? ":" + pad(a % 60) : ""}`;
  } catch {
    return "";
  }
}

const CURATED_TZS = [
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Sao_Paulo", "Atlantic/Reykjavik", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Athens", "Europe/Moscow",
  "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok", "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo",
  "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland", "UTC",
];

/** Express an absolute instant as wall-clock {day, minutes} in a time zone. */
export function instantInTz(instant: Date, timeZone: string): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(instant);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return { day: `${m.year}-${m.month}-${m.day}`, minutes: +m.hour * 60 + +m.minute };
}

/** The current day + minutes-since-midnight in a given time zone (for the now-line). */
export function nowInTz(timeZone: string): { day: string; minutes: number } {
  return instantInTz(new Date(), timeZone);
}

/** Convert a wall-clock (day "YYYY-MM-DD", time "HH:MM") from one zone to another. */
export function convertWallClock(day: string, hm: string, fromTz: string, toTz: string): { day: string; minutes: number } {
  const { y, m, d } = parseYmd(day);
  const [h, mi] = hm.split(":").map(Number);
  const naiveUTC = Date.UTC(y, m - 1, d, h, mi);
  try {
    const off = tzOffsetMinutes(fromTz, new Date(naiveUTC)); // fromTz offset near that instant
    return instantInTz(new Date(naiveUTC - off * 60000), toTz);
  } catch {
    return { day, minutes: h * 60 + mi }; // unknown zone → leave as-is
  }
}

/** A copy of `e` with its timed date/start/end re-expressed in `displayTz`. All-day
 * events are tz-agnostic and returned unchanged. */
export function toDisplayEvent(e: CalEvent, displayTz: string): CalEvent {
  if (e.allDay || !e.startTime) return e;
  const fromTz = e.timeZone || displayTz;
  if (fromTz === displayTz) return e;
  const start = convertWallClock(e.date, e.startTime, fromTz, displayTz);
  const fmtHM = (mins: number) => {
    const v = (((mins % 1440) + 1440) % 1440);
    return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
  };
  const dur = e.endTime ? Math.max(0, minutesOf(e.endTime) - minutesOf(e.startTime)) : 0;
  const endMin = Math.min(start.minutes + dur, 1439); // keep the block within the display day
  return { ...e, date: start.day, startTime: fmtHM(start.minutes), endTime: e.endTime ? fmtHM(endMin) : null };
}

/** All IANA zones when the runtime supports it, else a curated shortlist. */
export function listTimeZones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (all && all.length) return all;
  } catch {
    /* fall through */
  }
  return CURATED_TZS;
}
