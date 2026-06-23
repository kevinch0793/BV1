import Link from "next/link";
import { prisma } from "@/lib/db";
import { profileWhere } from "@/lib/owner";
import { appDayRange, currentAppDayKey } from "@/lib/appday";
import { createProfile } from "@/app/actions/profiles";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const today = appDayRange(currentAppDayKey());
  const profiles = await prisma.profile.findMany({
    where: await profileWhere(),
    orderBy: { updatedAt: "desc" },
    include: {
      // Today's jobs only — for the card's applied/tailored counts.
      jobs: {
        where: { createdAt: { gte: today.start } },
        select: { applyStatus: true, tailored: { take: 1, select: { id: true } } },
      },
      client: { select: { email: true } },
    },
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-neutral-900">Profiles</h1>

      <form
        action={createProfile}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4"
      >
        <Field label="Profile label" name="label" placeholder="e.g. ML Engineer" required />
        <Field label="Full name" name="fullName" placeholder="e.g. Jordan Sommers" required />
        <button className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800">
          + New profile
        </button>
      </form>

      {profiles.length === 0 ? (
        <p className="text-sm text-neutral-500">No profiles yet — create one above.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <li key={p.id} className="rounded-xl border border-neutral-200 bg-white transition hover:border-sky-300 hover:shadow-sm">
              <Link href={`/profiles/${p.id}`} className="block p-4">
                <div className="text-sm font-medium text-sky-700">{p.label}</div>
                <div className="text-lg font-semibold text-neutral-900">{p.fullName}</div>
                <div className="mt-1 truncate text-xs text-neutral-400" title={p.client.email}>{p.client.email}</div>
              </Link>
              <Link
                href={`/profiles/${p.id}/dashboard`}
                className="block rounded-b-xl border-t border-neutral-100 px-4 py-2 text-xs font-medium text-neutral-500 hover:bg-sky-50 hover:text-sky-700"
              >
                Today: {p.jobs.filter((j) => j.applyStatus === "applied").length} applied ·{" "}
                {p.jobs.filter((j) => j.tailored.length > 0).length} tailored →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        required={required}
        className="w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </label>
  );
}
