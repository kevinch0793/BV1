"use client";

import { useMemo, useState, useTransition } from "react";
import type { ResumeContent } from "@/lib/llm/schema";
import { ResumePreview, TEMPLATES, type TemplateId } from "@/components/templates";
import { generateTailored, saveTailored } from "@/app/actions/tailor";

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (fast, default)" },
  { id: "claude-opus-4-8", label: "Opus 4.8 (highest quality)" },
];

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const label = "flex flex-col gap-1 text-xs font-medium text-neutral-600";

type Mode = "with_base" | "from_scratch";

export function TailorWorkspace({
  profileId,
  hasBaseResume,
  projectCount,
  jobs,
}: {
  profileId: string;
  hasBaseResume: boolean;
  projectCount: number;
  jobs: { id: string; label: string }[];
}) {
  const [mode, setMode] = useState<Mode>(hasBaseResume ? "with_base" : "from_scratch");
  const [jobId, setJobId] = useState<string>(jobs[0]?.id ?? "");
  const [template, setTemplate] = useState<TemplateId>("classic");
  const [model, setModel] = useState(MODELS[0].id);
  const [instructions, setInstructions] = useState("");

  const [content, setContent] = useState<ResumeContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [generating, startGen] = useTransition();
  const [saving, startSave] = useTransition();

  // Strip empty bullets/skills before preview + save.
  const cleaned = useMemo(() => (content ? clean(content) : null), [content]);

  function generate() {
    setError(null);
    setSavedMsg(null);
    startGen(async () => {
      const r = await generateTailored({ profileId, jobId: jobId || undefined, mode, instructions, model });
      if (r.ok) setContent(r.content);
      else setError(r.error);
    });
  }

  function save() {
    if (!cleaned) return;
    startSave(async () => {
      await saveTailored({ profileId, jobId: jobId || undefined, mode, templateId: template, instructions, content: cleaned });
      setSavedMsg("Saved.");
    });
  }

  function patch(fn: (c: ResumeContent) => void) {
    setContent((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* Controls + editor */}
      <div className="no-print space-y-4">
        <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
          <div>
            <span className="text-xs font-medium text-neutral-600">Mode</span>
            <div className="mt-1 flex gap-2">
              <ModeButton active={mode === "with_base"} disabled={!hasBaseResume} onClick={() => setMode("with_base")}>
                From base resume
              </ModeButton>
              <ModeButton active={mode === "from_scratch"} onClick={() => setMode("from_scratch")}>
                From scratch
              </ModeButton>
            </div>
            {!hasBaseResume && <p className="mt-1 text-[11px] text-neutral-400">No base resume saved — using from-scratch.</p>}
            {mode === "from_scratch" && projectCount === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">From-scratch needs ≥1 project on the profile.</p>
            )}
          </div>

          <label className={label}>
            Target job
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={input}>
              <option value="">No specific job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.label}</option>
              ))}
            </select>
          </label>

          <label className={label}>
            Custom instructions to the LLM
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Emphasize leadership and distributed systems; keep to one page."
              className={input}
            />
          </label>

          <label className={label}>
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)} className={input}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>

          <button
            onClick={generate}
            disabled={generating}
            className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {generating ? "Generating…" : content ? "Regenerate" : "Generate tailored resume"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>

        {cleaned && <Editor content={content!} patch={patch} />}
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                title={t.description}
                className={`rounded-md px-3 py-1.5 text-sm ${template === t.id ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {cleaned && (
            <div className="flex items-center gap-2">
              {savedMsg && <span className="text-xs text-emerald-600">{savedMsg}</span>}
              <button onClick={save} disabled={saving} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => window.print()} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700">
                Download PDF
              </button>
            </div>
          )}
        </div>

        {cleaned ? (
          <div className="overflow-x-auto">
            <div className="print-sheet mx-auto">
              <ResumePreview content={cleaned} template={template} />
            </div>
          </div>
        ) : (
          <div className="grid h-96 place-items-center rounded-xl border border-dashed border-neutral-300 bg-white text-sm text-neutral-400">
            Configure options and generate to see a preview here.
          </div>
        )}
      </div>
    </div>
  );
}

function ModeButton({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${
        active ? "border-sky-600 bg-sky-50 text-sky-800" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

// ---- Inline editor for the generated content --------------------------------
function Editor({ content, patch }: { content: ResumeContent; patch: (fn: (c: ResumeContent) => void) => void }) {
  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">Edit content</h3>

      <label className={label}>Name<input className={input} value={content.name} onChange={(e) => patch((c) => { c.name = e.target.value; })} /></label>
      <label className={label}>Headline / title<input className={input} value={content.title} onChange={(e) => patch((c) => { c.title = e.target.value; })} /></label>
      <label className={label}>Summary<textarea rows={3} className={input} value={content.summary} onChange={(e) => patch((c) => { c.summary = e.target.value; })} /></label>

      <Group title="Experience">
        {content.experience.map((e, i) => (
          <div key={i} className="rounded-md border border-neutral-200 p-2">
            <div className="grid grid-cols-2 gap-2">
              <input className={input} value={e.role} placeholder="Role" onChange={(ev) => patch((c) => { c.experience[i].role = ev.target.value; })} />
              <input className={input} value={e.company} placeholder="Company" onChange={(ev) => patch((c) => { c.experience[i].company = ev.target.value; })} />
            </div>
            <textarea
              rows={3}
              className={`${input} mt-2`}
              value={e.bullets.join("\n")}
              onChange={(ev) => patch((c) => { c.experience[i].bullets = ev.target.value.split("\n"); })}
            />
          </div>
        ))}
      </Group>

      <Group title="Projects">
        {content.projects.map((p, i) => (
          <div key={i} className="rounded-md border border-neutral-200 p-2">
            <div className="grid grid-cols-2 gap-2">
              <input className={input} value={p.name} placeholder="Name" onChange={(ev) => patch((c) => { c.projects[i].name = ev.target.value; })} />
              <input className={input} value={p.type} placeholder="Type" onChange={(ev) => patch((c) => { c.projects[i].type = ev.target.value; })} />
            </div>
            <textarea
              rows={3}
              className={`${input} mt-2`}
              value={p.bullets.join("\n")}
              onChange={(ev) => patch((c) => { c.projects[i].bullets = ev.target.value.split("\n"); })}
            />
          </div>
        ))}
      </Group>

      <Group title="Skills (Category: a, b)">
        {content.skills.map((s, i) => (
          <div key={i} className="flex gap-2">
            <input className={`${input} w-1/3`} value={s.category} onChange={(ev) => patch((c) => { c.skills[i].category = ev.target.value; })} />
            <input className={input} value={s.items.join(", ")} onChange={(ev) => patch((c) => { c.skills[i].items = ev.target.value.split(",").map((x) => x.trim()); })} />
          </div>
        ))}
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
      {children}
    </div>
  );
}

// Remove empty bullets / skill items so the preview and PDF stay clean.
function clean(c: ResumeContent): ResumeContent {
  return {
    ...c,
    skills: c.skills
      .map((s) => ({ ...s, items: s.items.filter((x) => x.trim()) }))
      .filter((s) => s.items.length),
    experience: c.experience.map((e) => ({ ...e, bullets: e.bullets.filter((b) => b.trim()) })),
    projects: c.projects.map((p) => ({ ...p, bullets: p.bullets.filter((b) => b.trim()) })),
    contact: { ...c.contact, links: c.contact.links.filter((l) => l.url.trim()) },
  };
}
