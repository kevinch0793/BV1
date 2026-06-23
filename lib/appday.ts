// "App day" boundary: a new day starts at 10pm ET. So a timestamp at/after
// 10pm ET belongs to the NEXT calendar date (e.g. 10:30pm Jun 22 ET -> Jun 23).
// All day grouping/filtering for jobs goes through these helpers. DST-correct
// via Intl with the America/New_York time zone.

const ET = "America/New_York";
const DAY_START_HOUR = 22; // 10pm ET
const pad = (n: number) => String(n).padStart(2, "0");

function partsInET(d: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  let hour = g("hour");
  if (hour === 24) hour = 0; // some ICU builds report midnight as 24
  return { year: g("year"), month: g("month"), day: g("day"), hour, minute: g("minute"), second: g("second") };
}

// Minutes to add to UTC to get the ET wall clock (e.g. -240 in EDT, -300 in EST).
function etOffsetMinutes(d: Date): number {
  const p = partsInET(d);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - d.getTime()) / 60000);
}

// The UTC instant whose ET wall clock is (y, mo, day, hour, min).
function etWallToUtc(y: number, mo: number, day: number, hour: number, min = 0): Date {
  const wallAsUtc = Date.UTC(y, mo - 1, day, hour, min);
  let off = etOffsetMinutes(new Date(wallAsUtc));
  off = etOffsetMinutes(new Date(wallAsUtc - off * 60000)); // refine across DST edges
  return new Date(wallAsUtc - off * 60000);
}

/** App-day key ("YYYY-MM-DD") for a timestamp: +1 day if at/after 10pm ET. */
export function appDayKey(d: Date): string {
  const p = partsInET(d);
  let { year, month, day } = p;
  if (p.hour >= DAY_START_HOUR) {
    const next = new Date(Date.UTC(year, month - 1, day));
    next.setUTCDate(next.getUTCDate() + 1);
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function currentAppDayKey(): string {
  return appDayKey(new Date());
}

/** [start, end) UTC instants bounding the app day labeled by `key`. */
export function appDayRange(key: string): { start: Date; end: Date } {
  const [y, mo, dd] = key.split("-").map(Number);
  const end = etWallToUtc(y, mo, dd, DAY_START_HOUR); // 10pm ET on the labeled date
  const prev = new Date(Date.UTC(y, mo - 1, dd));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const start = etWallToUtc(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), DAY_START_HOUR);
  return { start, end };
}

export function isValidDayKey(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** The last `n` app-day keys (ascending), ending with the current app day. */
export function recentAppDayKeys(n: number): string[] {
  const [y, mo, dd] = currentAppDayKey().split("-").map(Number);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, mo - 1, dd));
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
  }
  return keys;
}
