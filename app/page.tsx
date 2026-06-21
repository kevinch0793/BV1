import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [profiles, recent] = await Promise.all([
    prisma.profile.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { jobs: true, tailored: true } } },
    }),
    prisma.tailoredResume.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { profile: true, job: true },
    }),
  ]);

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
              <Link
                key={p.id}
                href={`/profiles/${p.id}`}
                className="rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm"
              >
                <div className="text-sm font-medium text-sky-700">{p.label}</div>
                <div className="text-lg font-semibold text-neutral-900">{p.fullName}</div>
                <div className="mt-2 text-xs text-neutral-500">
                  {p._count.jobs} jobs · {p._count.tailored} tailored resumes
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Recent tailored resumes</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing generated yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <span className="font-medium text-neutral-900">
                    {t.job?.role || "Resume"}
                    {t.job?.company ? ` · ${t.job.company}` : ""}
                  </span>
                  <span className="ml-2 text-neutral-500">
                    {t.profile?.label ? `${t.profile.label} · ` : ""}
                    {t.mode === "with_base" ? "from base" : "from scratch"} · {t.templateId}
                  </span>
                </div>
                <Link href={`/profiles/${t.profileId}`} className="text-sky-700 hover:underline">
                  Profile
                </Link>
              </li>
            ))}
          </ul>
        )}
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
