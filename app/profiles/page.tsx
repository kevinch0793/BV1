import Link from "next/link";
import { prisma } from "@/lib/db";
import { createProfile } from "@/app/actions/profiles";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const profiles = await prisma.profile.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { jobs: true, tailored: true, projects: true } } },
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
            <li key={p.id}>
              <Link
                href={`/profiles/${p.id}`}
                className="block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm"
              >
                <div className="text-sm font-medium text-sky-700">{p.label}</div>
                <div className="text-lg font-semibold text-neutral-900">{p.fullName}</div>
                <div className="mt-2 text-xs text-neutral-500">
                  {p._count.projects} projects · {p._count.jobs} jobs · {p._count.tailored} resumes
                </div>
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
