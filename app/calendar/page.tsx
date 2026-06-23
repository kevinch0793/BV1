import { prisma } from "@/lib/db";
import { ownedByProfileWhere } from "@/lib/owner";
import { CalendarView, type DayEntry } from "@/components/CalendarView";

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
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  // Only count real job applications (tailored resumes tied to an existing job),
  // and at most one per job, so the calendar reflects what actually exists.
  const tailored = await prisma.tailoredResume.findMany({
    where: { ...(await ownedByProfileWhere()), createdAt: { gte: start, lt: end }, jobPostingId: { not: null } },
    orderBy: { createdAt: "asc" },
    include: {
      profile: { select: { id: true, fullName: true } },
      job: { select: { role: true, company: true, applyStatus: true } },
    },
  });

  const seenJob = new Set<string>();
  const entries: DayEntry[] = [];
  for (const t of tailored) {
    if (!t.jobPostingId || seenJob.has(t.jobPostingId)) continue;
    seenJob.add(t.jobPostingId);
    entries.push({
      tailoredId: t.id,
      day: new Date(t.createdAt).getDate(),
      profileId: t.profileId,
      profileLabel: t.profile.fullName,
      role: t.job?.role ?? null,
      company: t.job?.company ?? null,
      fitAfter: t.fitAfter,
      applied: t.job?.applyStatus === "applied",
    });
  }

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
