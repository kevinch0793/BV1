import Link from "next/link";
import { prisma } from "@/lib/db";
import { profileWhere } from "@/lib/owner";
import { AppliedChart } from "@/components/AppliedChart";
import { AddUrlsButton } from "@/components/AddUrlsButton";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const profiles = await prisma.profile.findMany({
    where: await profileWhere(),
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { email: true } },
      // Jobs that have a tailored resume = "tailored"; applyStatus "applied" = "applied".
      _count: { select: { tailored: { where: { jobPostingId: { not: null } } } } },
      jobs: { where: { applyStatus: "applied" }, select: { appliedAt: true } },
    },
  });

  // Applied timestamps (last 30 days) across all visible profiles for the chart.
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const applied = profiles
    .flatMap((p) => p.jobs)
    .map((j) => (j.appliedAt ? new Date(j.appliedAt).getTime() : 0))
    .filter((t) => t >= monthAgo);

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">Profiles</h1>
          <Link
            href="/profiles"
            className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            Manage profiles
          </Link>
        </div>
        {profiles.length === 0 ? (
          <EmptyCard
            title="No profiles yet"
            body="A profile is one identity — name, contact, work history, projects. Create one to start tailoring resumes."
            href="/profiles"
            cta="Create your first profile"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <div key={p.id} className="relative">
                <Link
                  href={`/profiles/${p.id}`}
                  className="block rounded-xl border border-neutral-200 bg-white p-4 pr-10 transition hover:border-sky-300 hover:shadow-sm"
                >
                  <div className="text-sm font-medium text-sky-700">{p.label}</div>
                  <div className="text-lg font-semibold text-neutral-900">{p.fullName}</div>
                  <div className="mt-1 truncate text-xs text-neutral-400" title={p.client.email}>{p.client.email}</div>
                  <div className="mt-2 text-xs text-neutral-500">
                    {p.jobs.length} applied · {p._count.tailored} tailored
                  </div>
                </Link>
                <AddUrlsButton profileId={p.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Applications per day</h2>
        <AppliedChart applied={applied} />
      </section>
    </div>
  );
}

function EmptyCard({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
      <h3 className="text-lg font-medium text-neutral-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">{body}</p>
      <Link href={href} className="mt-4 inline-block rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800">
        {cta}
      </Link>
    </div>
  );
}
