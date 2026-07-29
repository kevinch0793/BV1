import { getSettings, getGlobalModel, TAILORING_MODELS } from "@/lib/settings";
import { updateSettings, updateTailoringModel, updateSkillsConfig } from "@/app/actions/settings";
import { requireClient } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DirtyForm } from "@/components/DirtyForm";
import { SectionOrderEditor } from "@/components/SectionOrderEditor";
import { ApiTokenPanel } from "@/components/ApiTokenPanel";

export const dynamic = "force-dynamic";

const BASELINE = [
  'Simple headline — just the role (e.g. "Software Engineer", "AI Engineer"), matched to the JD.',
  "Contact: include provided details; only show LinkedIn/GitHub/portfolio links that actually exist.",
  "Focused summary (2–4 sentences) — always highlights Agile experience + AI dev tools, aligned to the JD.",
  "Skills grouped into a configurable number of categories (set below) — filled from the profile's own skills + role-relevant defaults even when the JD is thin; always includes Agile + AI tools (Claude, Copilot CLI).",
  "4–7 bullets per company/project, with specific numbers in only one bullet each.",
  'AI tools (Claude Code / Copilot CLI) only in the most-recent company — incl. a "Used Claude Code / Copilot CLI in …" bullet.',
  "Agile experience can appear in any company/project; remote evidence is enough in the most-recent company.",
  "Never uses AI-sounding language; stays ATS-friendly, 1–2 pages.",
];

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const saveBtn =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900";

export default async function SettingsPage() {
  const { id: clientId, role } = await requireClient();
  const isAdmin = role === "admin";
  const [settings, globalModel, profiles, answerTokens] = await Promise.all([
    getSettings(clientId),
    getGlobalModel(),
    prisma.profile.findMany({ where: { clientId }, orderBy: { createdAt: "asc" }, select: { id: true, fullName: true, label: true } }),
    prisma.answerToken.findMany({ where: { clientId }, select: { id: true, profileId: true, createdAt: true, lastUsedAt: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-500">Tune how the AI writes and tailors your resumes.</p>
      </div>

      {/* Baseline rules — always applied */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">Built-in resume rules</h2>
        <p className="mb-3 text-xs text-neutral-500">Always applied to every resume (2026 best-practices). Your custom instructions below layer on top.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          {BASELINE.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </section>

      {/* Tailoring model — admin only. This is a GLOBAL setting: one model governs
          every client's tailoring, so it's hidden from non-admin clients. */}
      {isAdmin && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-neutral-900">Tailoring model <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">Admin</span></h2>
          <p className="mb-3 text-xs text-neutral-500">The Claude model used to tailor every resume, for <strong>all clients</strong> (global). Resume/JD parsing always uses a fast model.</p>
          <DirtyForm action={updateTailoringModel} className="space-y-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
              Model
              <select name="tailoringModel" defaultValue={globalModel} className={`${input} max-w-xs`}>
                {TAILORING_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
            <button data-save className={saveBtn}>Save model</button>
          </DirtyForm>
        </section>
      )}

      {/* Skills section size */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">Skills section size</h2>
        <p className="mb-3 text-xs text-neutral-500">
          How big the Skills section is on every resume. It fills to this range using the profile&apos;s own skills plus role-relevant defaults, even when the job description lists only a few — so it&apos;s never sparse. Only genuinely-held skills are used.
        </p>
        <DirtyForm action={updateSkillsConfig} className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <fieldset className="flex items-end gap-2">
            <legend className="mb-1 text-sm font-medium text-neutral-700">Categories</legend>
            <NumField label="Min" name="skillsMinCategories" value={settings.skills.minCategories} min={1} max={10} />
            <span className="pb-1.5 text-neutral-400">to</span>
            <NumField label="Max" name="skillsMaxCategories" value={settings.skills.maxCategories} min={1} max={10} />
          </fieldset>
          <fieldset className="flex items-end gap-2">
            <legend className="mb-1 text-sm font-medium text-neutral-700">Skills per category</legend>
            <NumField label="Min" name="skillsMinItems" value={settings.skills.minItems} min={1} max={20} />
            <span className="pb-1.5 text-neutral-400">to</span>
            <NumField label="Max" name="skillsMaxItems" value={settings.skills.maxItems} min={1} max={20} />
          </fieldset>
          <button data-save className={saveBtn}>Save skills size</button>
        </DirtyForm>
      </section>

      {/* Layout — section ordering (drag & drop) */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">Section order</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Drag to set the order sections appear in every resume — including the PDF and DOCX you download.
        </p>
        <SectionOrderEditor initial={settings.sectionOrder} />
      </section>

      {/* Editable custom instructions */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">Custom instructions</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Extra global guidance for the AI on every tailoring (e.g. tone, target seniority, things to emphasize or avoid). Per-job instructions on the dashboard still layer on top of these.
        </p>
        <DirtyForm action={updateSettings} className="space-y-2">
          <textarea
            name="customInstructions"
            rows={8}
            className={input}
            defaultValue={settings.customInstructions}
            placeholder={"e.g. Target senior/staff remote roles. Emphasize platform and infra impact. Keep to one page. Prefer metrics over adjectives."}
          />
          <button data-save className={saveBtn}>Save instructions</button>
        </DirtyForm>
      </section>

      {/* Application-answer browser extension */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">Application-answer extension</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Generate a token for each profile you want to answer as, then paste each token into that profile&apos;s browser-extension install (e.g. a separate Chrome profile per candidate). Each token answers as its own profile, so several candidates can use the extension at the same time. A token is shown once — copy it and keep it safe.
        </p>
        <ApiTokenPanel
          profiles={profiles.map((p) => ({ id: p.id, name: p.fullName || p.label }))}
          tokens={answerTokens.map((t) => ({
            id: t.id,
            profileId: t.profileId,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
          }))}
        />
      </section>
    </div>
  );
}

function NumField({ label, name, value, min, max }: { label: string; name: string; value: number; min: number; max: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-500">
      {label}
      <input
        type="number"
        name={name}
        defaultValue={value}
        min={min}
        max={max}
        step={1}
        className="w-16 rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </label>
  );
}
