import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TailorWorkspace } from "./TailorWorkspace";

export const dynamic = "force-dynamic";

export default async function TailorPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: {
      baseResume: true,
      jobs: { orderBy: { createdAt: "desc" } },
      _count: { select: { projects: true } },
    },
  });
  if (!profile) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/profiles/${profile.id}`} className="text-sm text-sky-700 hover:underline">
          ← {profile.fullName}
        </Link>
        <h1 className="text-2xl font-semibold text-neutral-900">Tailor a resume</h1>
      </div>
      <TailorWorkspace
        profileId={profile.id}
        hasBaseResume={!!profile.baseResume}
        projectCount={profile._count.projects}
        jobs={profile.jobs.map((j) => ({
          id: j.id,
          label: `${j.role || "Role?"} · ${j.company || "Company?"}`,
        }))}
      />
    </div>
  );
}
