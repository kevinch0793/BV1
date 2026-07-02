import Link from "next/link";
import { prisma } from "@/lib/db";
import { ownedByProfileWhere, profileWhere } from "@/lib/owner";
import { fitColor } from "@/lib/fit";
import { fuzzyScore } from "@/lib/fuzzy";
import { workplaceOf, briefState, type Workplace } from "@/lib/location";
import { ColumnSearch } from "@/components/ColumnSearch";
import { ViewResumeButton } from "@/components/ViewResumeButton";

export const dynamic = "force-dynamic";

const LIMIT = 100;

const WORKPLACE_STYLE: Record<Workplace, string> = {
  Remote: "bg-emerald-100 text-emerald-700",
  Hybrid: "bg-amber-100 text-amber-700",
  "In-Person": "bg-orange-100 text-orange-700",
  Onsite: "bg-neutral-100 text-neutral-600",
};

type Row = {
  id: string; company: string | null; role: string | null; location: string | null; workplace: string | null;
  status: string; applyStatus: string; appliedAt: Date | null; url: string | null; profileId: string; profileName: string;
  tailoredId: string | null; fitAfter: number | null;
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ company?: string; role?: string; profile?: string }> }) {
  const sp = await searchParams;
  const company = (sp.company ?? "").trim();
  const role = (sp.role ?? "").trim();
  const profile = (sp.profile ?? "").trim();
  const hasFilter = !!(company || role || profile);
  const jobScope = await ownedByProfileWhere();

  let rows: Row[];
  let total: number; // total matches (may exceed LIMIT)

  if (!hasFilter) {
    // Default browse — cheap recent-100 with bounded relation loads.
    const recent = await prisma.jobPosting.findMany({
      where: jobScope,
      select: {
        id: true, company: true, role: true, location: true, workplace: true, status: true, applyStatus: true, appliedAt: true, url: true, profileId: true,
        profile: { select: { fullName: true, label: true } },
        tailored: { select: { id: true, fitAfter: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    });
    rows = recent.map((j) => ({
      id: j.id, company: j.company, role: j.role, location: j.location, workplace: j.workplace, status: j.status, applyStatus: j.applyStatus, appliedAt: j.appliedAt, url: j.url,
      profileId: j.profileId, profileName: j.profile.fullName || j.profile.label, tailoredId: j.tailored[0]?.id ?? null, fitAfter: j.tailored[0]?.fitAfter ?? null,
    }));
    total = rows.length;
  } else {
    // Fuzzy filtering happens in memory, so load the client's jobs (scalars only —
    // no relation loads, P2029-safe) plus the profile names and tailored scores.
    const [jobs, profiles, tailored] = await Promise.all([
      prisma.jobPosting.findMany({
        where: jobScope,
        select: { id: true, company: true, role: true, location: true, workplace: true, status: true, applyStatus: true, appliedAt: true, url: true, profileId: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.profile.findMany({ where: await profileWhere(), select: { id: true, fullName: true, label: true } }),
      prisma.tailoredResume.findMany({ where: { ...jobScope, jobPostingId: { not: null } }, select: { jobPostingId: true, id: true, fitAfter: true }, orderBy: { createdAt: "desc" } }),
    ]);
    const nameOf = new Map(profiles.map((p) => [p.id, p.fullName || p.label]));
    const tailoredOf = new Map<string, { id: string; fitAfter: number | null }>();
    for (const t of tailored) if (t.jobPostingId && !tailoredOf.has(t.jobPostingId)) tailoredOf.set(t.jobPostingId, { id: t.id, fitAfter: t.fitAfter });

    const scored: { row: Row; score: number }[] = [];
    for (const j of jobs) {
      const name = nameOf.get(j.profileId) ?? "";
      let s = 0;
      if (company) { const c = fuzzyScore(company, j.company); if (!c) continue; s += c; }
      if (role) { const r = fuzzyScore(role, j.role); if (!r) continue; s += r; }
      if (profile) { const p = fuzzyScore(profile, name); if (!p) continue; s += p; }
      const t = tailoredOf.get(j.id);
      scored.push({
        score: s,
        row: { id: j.id, company: j.company, role: j.role, location: j.location, workplace: j.workplace, status: j.status, applyStatus: j.applyStatus, appliedAt: j.appliedAt, url: j.url, profileId: j.profileId, profileName: name, tailoredId: t?.id ?? null, fitAfter: t?.fitAfter ?? null },
      });
    }
    scored.sort((a, b) => b.score - a.score); // best matches first; ties keep recency (stable sort)
    total = scored.length;
    rows = scored.slice(0, LIMIT).map((x) => x.row);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Search</h1>
        <p className="text-sm text-neutral-500">Filter jobs by company, role, and profile — typo- and wording-tolerant (e.g. “fullstack engineer” finds “Full Stack Software Developer”).</p>
      </div>

      <p className="text-xs text-neutral-500">
        {hasFilter
          ? total > LIMIT
            ? `Best ${LIMIT} of ${total} matches.`
            : `${total} match${total === 1 ? "" : "es"}.`
          : `${total} recent job${total === 1 ? "" : "s"} — type in a column header to filter.`}
      </p>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left align-top text-xs uppercase tracking-wide text-neutral-500">
              <Th title="Company"><ColumnSearch param="company" placeholder="Filter company" initial={company} /></Th>
              <Th title="Role"><ColumnSearch param="role" placeholder="Filter role" initial={role} /></Th>
              <Th title="Profile"><ColumnSearch param="profile" placeholder="Filter profile" initial={profile} /></Th>
              <Th title="Location" />
              <Th title="ATS" />
              <Th title="JD" />
              <Th title="Applied" />
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-neutral-400">No jobs match these filters.</td>
              </tr>
            ) : (
              rows.map((j) => (
                <tr key={j.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className="hover:text-sky-700 hover:underline">{j.company || "—"}</a>
                    ) : (
                      j.company || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{j.role || "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/profiles/${j.profileId}/dashboard`} className="text-sky-700 hover:underline">{j.profileName}</Link>
                  </td>
                  <td className="px-4 py-3"><LocationBadge workplace={j.workplace} location={j.location} /></td>
                  <td className="px-4 py-3">
                    {j.fitAfter != null ? (
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: fitColor(j.fitAfter).bg, color: fitColor(j.fitAfter).text }}>{j.fitAfter}%</span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-xs font-medium text-sky-700 hover:underline">Open&nbsp;↗</a>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                    {j.applyStatus === "applied" && j.appliedAt ? fmtDate(j.appliedAt) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {j.tailoredId && <ViewResumeButton tailoredId={j.tailoredId} />}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 font-medium">
      <div className="mb-1">{title}</div>
      {children ?? <div className="h-[26px]" />}
    </th>
  );
}

function LocationBadge({ workplace, location }: { workplace: string | null; location: string | null }) {
  if (!workplace && !location) return <span className="text-neutral-400">—</span>;
  const kind = workplaceOf(workplace, location);
  const where = kind === "Remote" ? "" : briefState(location);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${WORKPLACE_STYLE[kind]}`}>{kind}</span>
      {where && <span className="text-neutral-500">{where}</span>}
    </span>
  );
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
