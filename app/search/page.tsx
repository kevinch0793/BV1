import Link from "next/link";
import { prisma } from "@/lib/db";
import { ownedByProfileWhere } from "@/lib/owner";
import { fitColor } from "@/lib/fit";
import { workplaceOf, briefState, type Workplace } from "@/lib/location";
import { ColumnSearch } from "@/components/ColumnSearch";

export const dynamic = "force-dynamic";

const LIMIT = 100;

const WORKPLACE_STYLE: Record<Workplace, string> = {
  Remote: "bg-emerald-100 text-emerald-700",
  Hybrid: "bg-amber-100 text-amber-700",
  "In-Person": "bg-orange-100 text-orange-700",
  Onsite: "bg-neutral-100 text-neutral-600",
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ company?: string; role?: string; profile?: string }> }) {
  const sp = await searchParams;
  const company = (sp.company ?? "").trim();
  const role = (sp.role ?? "").trim();
  const profile = (sp.profile ?? "").trim();
  const hasFilter = !!(company || role || profile);

  // Each column filter ANDs with the others; an empty AND matches everything.
  // `take` bounds the relation includes well under the libSQL param limit.
  const results = await prisma.jobPosting.findMany({
    where: {
      ...(await ownedByProfileWhere()),
      AND: [
        ...(company ? [{ company: { contains: company } }] : []),
        ...(role ? [{ role: { contains: role } }] : []),
        ...(profile ? [{ profile: { OR: [{ fullName: { contains: profile } }, { label: { contains: profile } }] } }] : []),
      ],
    },
    select: {
      id: true, company: true, role: true, location: true, workplace: true,
      status: true, applyStatus: true, url: true, profileId: true,
      profile: { select: { fullName: true, label: true } },
      tailored: { select: { id: true, fitAfter: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Search</h1>
        <p className="text-sm text-neutral-500">Filter jobs by company, role, and profile — each column has its own search.</p>
      </div>

      <p className="text-xs text-neutral-500">
        {results.length === LIMIT
          ? `Showing the first ${LIMIT} ${hasFilter ? "matches" : "recent jobs"}`
          : `${results.length} ${hasFilter ? `match${results.length === 1 ? "" : "es"}` : `recent job${results.length === 1 ? "" : "s"}`}`}
        {hasFilter ? "." : " — type in a column header to filter."}
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
              <Th title="Status" />
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-neutral-400">No jobs match these filters.</td>
              </tr>
            ) : (
              results.map((j) => {
                const tailored = j.tailored[0] ?? null;
                return (
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
                      <Link href={`/profiles/${j.profileId}/dashboard`} className="text-sky-700 hover:underline">
                        {j.profile.fullName || j.profile.label}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><LocationBadge workplace={j.workplace} location={j.location} /></td>
                    <td className="px-4 py-3">
                      {tailored?.fitAfter != null ? (
                        <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: fitColor(tailored.fitAfter).bg, color: fitColor(tailored.fitAfter).text }}>
                          {tailored.fitAfter}%
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge applyStatus={j.applyStatus} status={j.status} tailored={!!tailored} /></td>
                    <td className="px-4 py-3 text-right">
                      {tailored && (
                        <Link href={`/resume/${tailored.id}`} className="whitespace-nowrap text-xs font-medium text-sky-700 hover:underline">View resume</Link>
                      )}
                    </td>
                  </tr>
                );
              })
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

function StatusBadge({ applyStatus, status, tailored }: { applyStatus: string; status: string; tailored: boolean }) {
  if (applyStatus === "applied") return <Badge className="bg-sky-100 text-sky-700">Applied</Badge>;
  if (status === "failed") return <Badge className="bg-rose-100 text-rose-700">Failed</Badge>;
  if (tailored) return <Badge className="bg-emerald-100 text-emerald-700">Tailored</Badge>;
  if (status === "fetched") return <Badge className="bg-neutral-100 text-neutral-600">Fetched</Badge>;
  return <Badge className="bg-neutral-100 text-neutral-500">Pending</Badge>;
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}
