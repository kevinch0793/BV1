import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { profileInclude, asLinks } from "@/lib/profile-data";
import { asStringArray } from "@/lib/llm/service";
import {
  updateProfileBasics,
  deleteProfile,
  addExperience,
  updateExperience,
  deleteExperience,
  addEducation,
  updateEducation,
  deleteEducation,
  addProject,
  updateProject,
  deleteProject,
  setSkills,
  saveBaseResume,
} from "@/app/actions/profiles";
import { deleteJob } from "@/app/actions/jobs";
import { JobAdder } from "./JobAdder";
import { ResumeParser } from "./ResumeParser";
import { CollapsibleItem } from "@/components/CollapsibleItem";
import { DirtyForm } from "@/components/DirtyForm";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const labelCls = "flex flex-col gap-1 text-xs font-medium text-neutral-600";
const saveBtn =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900";
const delBtn = "rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50";

export default async function ProfileEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({ where: { id }, include: profileInclude });
  if (!profile) notFound();

  const links = asLinks(profile.links);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/profiles" className="text-sm text-sky-700 hover:underline">
            ← All profiles
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-900">{profile.fullName}</h1>
          <p className="text-sm text-neutral-500">{profile.label}</p>
        </div>
        <Link
          href={`/tailor/${profile.id}`}
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
        >
          Tailor a resume →
        </Link>
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
              <label className={`${labelCls} mt-2`}>
                Bullets (one per line)
                <textarea name="bullets" rows={3} defaultValue={asStringArray(e.bullets).join("\n")} className={input} />
              </label>
              <div className="mt-2 flex gap-2">
                <button data-save className={saveBtn}>Save</button>
                <button formAction={deleteExperience.bind(null, e.id, profile.id)} className={delBtn}>Delete</button>
              </div>
            </DirtyForm>
            </CollapsibleItem>
          ))}
        </div>
      </Card>

      {/* Projects */}
      <Card
        title="Projects"
        subtitle="Name + type are required — these anchor from-scratch generation (e.g. GEM — Ads foundation model)."
        action={
          <form action={addProject.bind(null, profile.id)}>
            <button className={saveBtn}>+ Add</button>
          </form>
        }
      >
        {profile.projects.length === 0 && <Empty>No projects yet.</Empty>}
        <div className="space-y-3">
          {profile.projects.map((p) => (
            <CollapsibleItem
              key={p.id}
              summary={p.name || p.type ? `${p.name || "Project"}${p.type ? ` — ${p.type}` : ""}` : "New project"}
              meta={p.company ?? undefined}
              defaultOpen={!p.name && !p.type}
            >
            <DirtyForm action={updateProject.bind(null, p.id, profile.id)}>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={labelCls}>Name *<input name="name" defaultValue={p.name} className={input} required /></label>
                <label className={labelCls}>Type *<input name="type" defaultValue={p.type} placeholder="e.g. Internal platform" className={input} required /></label>
                <label className={labelCls}>Company<input name="company" defaultValue={p.company ?? ""} className={input} /></label>
              </div>
              <label className={`${labelCls} mt-2`}>Description<input name="description" defaultValue={p.description ?? ""} className={input} /></label>
              <label className={`${labelCls} mt-2`}>
                Bullets (one per line)
                <textarea name="bullets" rows={3} defaultValue={asStringArray(p.bullets).join("\n")} className={input} />
              </label>
              <div className="mt-2 flex gap-2">
                <button data-save className={saveBtn}>Save</button>
                <button formAction={deleteProject.bind(null, p.id, profile.id)} className={delBtn}>Delete</button>
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

      {/* Base resume */}
      <Card title="Base resume (optional)" subtitle="Paste your existing resume text. Enables 'tailor from base' mode.">
        <DirtyForm action={saveBaseResume.bind(null, profile.id)} className="space-y-2">
          <textarea name="rawText" rows={8} className={input} defaultValue={profile.baseResume?.rawText ?? ""} />
          <button data-save className={saveBtn}>Save base resume</button>
        </DirtyForm>
      </Card>

      {/* Jobs */}
      <Card title="Saved jobs" subtitle="Add a job URL (auto-scraped) or paste the description.">
        <JobAdder profileId={profile.id} />
        {profile.jobs.length === 0 ? (
          <Empty>No jobs saved yet.</Empty>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {profile.jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-neutral-900">{j.role || "Role?"}</span>
                  <span className="text-neutral-500"> · {j.company || "Company?"}{j.location ? ` · ${j.location}` : ""}</span>
                  {j.url && (
                    <a href={j.url} target="_blank" rel="noreferrer" className="ml-2 text-xs text-sky-700 hover:underline">
                      link
                    </a>
                  )}
                </div>
                <form action={deleteJob.bind(null, j.id, profile.id)}>
                  <button className="text-xs text-red-600 hover:underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
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
