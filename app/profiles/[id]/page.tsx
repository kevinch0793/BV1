import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { profileWhere } from "@/lib/owner";
import { profileInclude, asLinks, asProjectGroups } from "@/lib/profile-data";
import { FixedResumeBox } from "@/components/FixedResumeBox";
import {
  updateProfileBasics,
  deleteProfile,
  addExperience,
  updateExperience,
  deleteExperience,
  addEducation,
  updateEducation,
  deleteEducation,
  setSkills,
  saveBaseResume,
} from "@/app/actions/profiles";
import { ResumeParser } from "./ResumeParser";
import { CollapsibleItem } from "@/components/CollapsibleItem";
import { DirtyForm } from "@/components/DirtyForm";
import { ExperienceProjects } from "@/components/ExperienceProjects";
import { ProfileTemplateCard } from "@/components/ProfileTemplateCard";
import { templatesFor } from "@/components/templates";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const labelCls = "flex flex-col gap-1 text-xs font-medium text-neutral-600";
const saveBtn =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900";
const delBtn = "rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50";

export default async function ProfileEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.profile.findFirst({ where: { id, ...(await profileWhere()) }, include: profileInclude });
  if (!profile) notFound();

  const links = asLinks(profile.links);
  const [{ sectionOrder }, siblings, owner] = await Promise.all([
    getSettings(profile.clientId),
    prisma.profile.findMany({
      where: { ...(await profileWhere()), id: { not: profile.id } },
      select: { label: true, templateId: true, resumeFont: true, resumeAccent: true },
    }),
    prisma.client.findUnique({ where: { id: profile.clientId }, select: { email: true } }),
  ]);

  return (
    <div className="space-y-8">
      {/* Pinned header — stays visible while editing the sections below */}
      <div className="sticky top-0 z-10 bg-background pt-2 pb-3 shadow-[0_8px_10px_-10px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/profiles" className="text-sm text-sky-700 hover:underline">
            ← All profiles
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-900">{profile.fullName}</h1>
          <p className="text-sm text-neutral-500">{profile.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/profiles/${profile.id}/dashboard`}
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            Tailoring dashboard →
          </Link>
        </div>
      </div>
      </div>

      {/* Parse an existing resume to auto-fill everything below */}
      <Card title="Parse a resume" subtitle="Auto-fill this profile from an existing resume.">
        <ResumeParser profileId={profile.id} />
      </Card>

      {/* Basics */}
      <Card title="Basics">
        <DirtyForm action={updateProfileBasics.bind(null, profile.id)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>Profile label<input name="label" defaultValue={profile.label} className={input} /></label>
            <label className={labelCls}>Full name<input name="fullName" defaultValue={profile.fullName} className={input} /></label>
            <label className={labelCls}>Email<input name="email" defaultValue={profile.email ?? ""} className={input} /></label>
            <label className={labelCls}>Phone<input name="phone" defaultValue={profile.phone ?? ""} className={input} /></label>
            <label className={labelCls}>Location<input name="location" defaultValue={profile.location ?? ""} className={input} /></label>
            <label className={labelCls}>LinkedIn<input name="linkedin" defaultValue={links.linkedin ?? ""} className={input} /></label>
            <label className={labelCls}>GitHub<input name="github" defaultValue={links.github ?? ""} className={input} /></label>
            <label className={labelCls}>Portfolio<input name="portfolio" defaultValue={links.portfolio ?? ""} className={input} /></label>
          </div>
          <label className={labelCls}>
            Summary
            <textarea name="summary" defaultValue={profile.summary ?? ""} rows={3} className={input} />
          </label>
          <button data-save className={saveBtn}>Save basics</button>
        </DirtyForm>
      </Card>

      {/* Resume template — per-profile style (template + font + color) */}
      <Card title="Resume template" subtitle="Template, font, and accent color for this profile's résumés (preview, PDF & DOCX). Set individually per profile.">
        <ProfileTemplateCard
          profileId={profile.id}
          initialTemplate={profile.templateId ?? "modern"}
          initialFont={profile.resumeFont ?? "sans"}
          initialAccent={profile.resumeAccent ?? "sky"}
          order={sectionOrder}
          templates={templatesFor(owner?.email)}
          siblings={siblings.map((s) => ({ label: s.label, template: s.templateId ?? "modern", font: s.resumeFont ?? "sans", accent: s.resumeAccent ?? "sky" }))}
        />
      </Card>

      {/* Experience */}
      <Card
        title="Work experience"
        action={
          <form action={addExperience.bind(null, profile.id)}>
            <button className={saveBtn}>+ Add</button>
          </form>
        }
      >
        {profile.experiences.length === 0 && <Empty>No experience yet.</Empty>}
        <div className="space-y-3">
          {profile.experiences.map((e) => (
            <CollapsibleItem
              key={e.id}
              summary={e.role || e.company ? `${e.role || "Role"}${e.company ? ` — ${e.company}` : ""}` : "New experience"}
              meta={[e.startDate, e.current ? "Present" : e.endDate].filter(Boolean).join(" – ")}
              defaultOpen={!e.company && !e.role}
            >
            <DirtyForm action={updateExperience.bind(null, e.id, profile.id)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>Role<input name="role" defaultValue={e.role} className={input} /></label>
                <label className={labelCls}>Company<input name="company" defaultValue={e.company} className={input} /></label>
                <label className={labelCls}>Location<input name="location" defaultValue={e.location ?? ""} className={input} /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={labelCls}>Start<input name="startDate" defaultValue={e.startDate ?? ""} className={input} /></label>
                  <label className={labelCls}>End<input name="endDate" defaultValue={e.endDate ?? ""} className={input} /></label>
                </div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                <input type="checkbox" name="current" defaultChecked={e.current} /> Current role
              </label>
              <div className="mt-3">
                <ExperienceProjects defaultProjects={asProjectGroups(e.projects)} />
              </div>
              <div className="mt-2 flex gap-2">
                <button data-save className={saveBtn}>Save</button>
                <button formAction={deleteExperience.bind(null, e.id, profile.id)} className={delBtn}>Delete</button>
              </div>
            </DirtyForm>
            </CollapsibleItem>
          ))}
        </div>
      </Card>

      {/* Education */}
      <Card
        title="Education"
        action={
          <form action={addEducation.bind(null, profile.id)}>
            <button className={saveBtn}>+ Add</button>
          </form>
        }
      >
        {profile.education.length === 0 && <Empty>No education yet.</Empty>}
        <div className="space-y-3">
          {profile.education.map((ed) => (
            <CollapsibleItem
              key={ed.id}
              summary={ed.school || ed.degree ? `${ed.school || "School"}${ed.degree ? ` — ${ed.degree}` : ""}` : "New education"}
              meta={[ed.startDate, ed.endDate].filter(Boolean).join(" – ")}
              defaultOpen={!ed.school && !ed.degree && !ed.field}
            >
            <DirtyForm action={updateEducation.bind(null, ed.id, profile.id)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>School<input name="school" defaultValue={ed.school} className={input} /></label>
                <label className={labelCls}>Degree<input name="degree" defaultValue={ed.degree ?? ""} className={input} /></label>
                <label className={labelCls}>Field<input name="field" defaultValue={ed.field ?? ""} className={input} /></label>
                <label className={labelCls}>GPA<input name="gpa" defaultValue={ed.gpa ?? ""} className={input} /></label>
                <label className={labelCls}>Start<input name="startDate" defaultValue={ed.startDate ?? ""} className={input} /></label>
                <label className={labelCls}>End<input name="endDate" defaultValue={ed.endDate ?? ""} className={input} /></label>
              </div>
              <div className="mt-2 flex gap-2">
                <button data-save className={saveBtn}>Save</button>
                <button formAction={deleteEducation.bind(null, ed.id, profile.id)} className={delBtn}>Delete</button>
              </div>
            </DirtyForm>
            </CollapsibleItem>
          ))}
        </div>
      </Card>

      {/* Skills */}
      <Card title="Skills" subtitle="One group per line. Format: Category: item, item, item">
        <DirtyForm action={setSkills.bind(null, profile.id)} className="space-y-2">
          <textarea
            name="skills"
            rows={4}
            className={input}
            defaultValue={skillsToText(profile.skills)}
            placeholder={"Languages: Python, Go, TypeScript\nML: PyTorch, JAX"}
          />
          <button data-save className={saveBtn}>Save skills</button>
        </DirtyForm>
      </Card>

      {/* Fixed resume — what a "normal"-plan candidate attaches to every
          application. Shown for every profile: uploading one costs nothing and
          it is immediately useful as a fallback download. */}
      <Card
        title="Fixed resume"
        subtitle="One PDF or DOCX attached to every application on the Normal plan. Downloads with the same clean name each time, so it replaces the previous copy."
      >
        <FixedResumeBox
          profileId={profile.id}
          current={
            profile.fixedResume
              ? {
                  filename: profile.fixedResume.filename,
                  size: profile.fixedResume.size,
                  updatedAt: profile.fixedResume.updatedAt.toISOString().slice(0, 10),
                }
              : null
          }
        />
      </Card>

      {/* Base resume */}
      <Card title="Base resume (optional)" subtitle="Paste your existing resume text. Enables 'tailor from base' mode.">
        <DirtyForm action={saveBaseResume.bind(null, profile.id)} className="space-y-2">
          <textarea name="rawText" rows={8} className={input} defaultValue={profile.baseResume?.rawText ?? ""} />
          <button data-save className={saveBtn}>Save base resume</button>
        </DirtyForm>
      </Card>

      {/* Jobs + tailoring — managed on the dashboard */}
      <Card title="Jobs & tailoring" subtitle="Add job URLs, fetch JDs, and auto-tailor a resume for each — in a queue.">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">
            {profile.jobs.length} job{profile.jobs.length === 1 ? "" : "s"} saved
          </span>
          <Link
            href={`/profiles/${profile.id}/dashboard`}
            className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            Open dashboard →
          </Link>
        </div>
      </Card>

      <Card title="Danger zone">
        <form action={deleteProfile.bind(null, profile.id)}>
          <button className={delBtn}>Delete this profile</button>
        </form>
      </Card>
    </div>
  );
}

function skillsToText(skills: { name: string; category: string | null }[]): string {
  const byCat = new Map<string, string[]>();
  for (const s of skills) {
    const key = s.category ?? "Skills";
    byCat.set(key, [...(byCat.get(key) ?? []), s.name]);
  }
  return [...byCat.entries()].map(([cat, items]) => `${cat}: ${items.join(", ")}`).join("\n");
}

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-400">{children}</p>;
}
