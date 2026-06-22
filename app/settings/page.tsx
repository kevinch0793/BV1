import { getSettings } from "@/lib/settings";
import { updateSettings, updateDefaultTemplate } from "@/app/actions/settings";
import { DirtyForm } from "@/components/DirtyForm";
import { SectionOrderEditor } from "@/components/SectionOrderEditor";
import { TEMPLATES } from "@/components/templates";

export const dynamic = "force-dynamic";

const BASELINE = [
  'Simple headline — just the role (e.g. "Software Engineer", "AI Engineer"), matched to the JD.',
  "Contact: include provided details; only show LinkedIn/GitHub/portfolio links that actually exist.",
  "Focused summary (2–4 sentences) — always highlights Agile experience + AI dev tools, aligned to the JD.",
  "Skills grouped by category, 5–8 concrete skills each; always includes Agile + AI tools (Claude, Copilot CLI); specific stacks.",
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
  const settings = await getSettings();

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

      {/* Default template */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">Default template</h2>
        <p className="mb-3 text-xs text-neutral-500">
          The template new resumes are tailored with, and the default selected in the dashboard and tailor pickers.
        </p>
        <DirtyForm action={updateDefaultTemplate} className="space-y-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
            Template
            <select name="defaultTemplate" defaultValue={settings.defaultTemplate} className={`${input} max-w-xs`}>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}: {t.description}</option>
              ))}
            </select>
          </label>
          <button data-save className={saveBtn}>Save template</button>
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
    </div>
  );
}
