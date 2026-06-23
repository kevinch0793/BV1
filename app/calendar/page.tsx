import { prisma } from "@/lib/db";
import { ownedByProfileWhere } from "@/lib/owner";
import { appDayKey, appDayRange } from "@/lib/appday";
import { CalendarView, type DayEntry } from "@/components/CalendarView";

const pad = (n: number) => String(n).padStart(2, "0");

export const dynamic = "force-dynamic";

function ym(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(m?: string): { year: number; month: number } {
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-").map(Number);
    return { year: y, month: mo - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const { year, month } = parseMonth(sp?.m);
  // Query the exact UTC span covering this month's app days (each rolls at 10pm
  // ET), so jobs land on the right calendar cell even across month boundaries.
  const lastDay = new Date(year, month + 1, 0).getDate();
  const queryStart = appDayRange(`${year}-${pad(month + 1)}-01`).start;
  const queryEnd = appDayRange(`${year}-${pad(month + 1)}-${pad(lastDay)}`).end;

  // Jobs grouped by the app day they were added (matches the dashboard's day
  // view), so clicking a day opens exactly that day's job table.
  const jobs = await prisma.jobPosting.findMany({
    where: { ...(await ownedByProfileWhere()), createdAt: { gte: queryStart, lt: queryEnd } },
    select: {
      createdAt: true,
      profileId: true,
      applyStatus: true,
      profile: { select: { fullName: true } },
      tailored: { take: 1, select: { id: true } },
    },
  });

  const entries: DayEntry[] = jobs.map((j) => ({
    day: Number(appDayKey(j.createdAt).split("-")[2]),
    profileId: j.profileId,
    profileLabel: j.profile.fullName,
    applied: j.applyStatus === "applied",
    tailored: j.tailored.length > 0,
  }));

  return (
    <CalendarView
      year={year}
      month={month}
      entries={entries}
      prevM={ym(year, month - 1)}
      nextM={ym(year, month + 1)}
    />
  );
}
