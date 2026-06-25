import { prisma } from "@/lib/db";
import { ownedByProfileWhere, profileWhere } from "@/lib/owner";
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

  const jobScope = await ownedByProfileWhere();
  // Load scalars + the relations SEPARATELY and join in memory. Including the
  // `profile`/`tailored` relations on hundreds of jobs makes Prisma emit an
  // `IN (...)` over every job id, which exceeds libSQL's bound-parameter limit
  // (P2029). These three queries each use a join/range filter, no big IN.
  const [jobs, profiles, tailored] = await Promise.all([
    prisma.jobPosting.findMany({
      where: { ...jobScope, createdAt: { gte: queryStart, lt: queryEnd } },
      select: { id: true, createdAt: true, profileId: true, applyStatus: true },
    }),
    prisma.profile.findMany({ where: await profileWhere(), select: { id: true, fullName: true } }),
    prisma.tailoredResume.findMany({
      where: { ...jobScope, jobPostingId: { not: null } },
      select: { jobPostingId: true },
    }),
  ]);

  const nameById = new Map(profiles.map((p) => [p.id, p.fullName]));
  const tailoredJobIds = new Set(tailored.map((t) => t.jobPostingId));

  const entries: DayEntry[] = jobs.map((j) => ({
    day: Number(appDayKey(j.createdAt).split("-")[2]),
    profileId: j.profileId,
    profileLabel: nameById.get(j.profileId) ?? "",
    applied: j.applyStatus === "applied",
    tailored: tailoredJobIds.has(j.id),
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
