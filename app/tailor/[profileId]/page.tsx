import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { profileWhere } from "@/lib/owner";
import { TailorWorkspace } from "./TailorWorkspace";

export const dynamic = "force-dynamic";

export default async function TailorPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, ...(await profileWhere()) },
    include: {
      baseResume: true,
      jobs: { where: { status: "fetched" }, orderBy: { createdAt: "desc" } },
      _count: { select: { experiences: true } },
    },
  });
  if (!profile) notFound();

  const { sectionOrder, defaultTemplate, resumeFont, resumeFontScale } = await getSettings(profile.clientId);

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
        projectCount={profile._count.experiences}
        order={sectionOrder}
        defaultTemplate={profile.templateId ?? defaultTemplate}
        fontId={resumeFont}
        fontScale={resumeFontScale}
        jobs={profile.jobs.map((j) => ({
          id: j.id,
          label: `${j.role || "Role?"} · ${j.company || "Company?"}`,
        }))}
      />
    </div>
  );
}
