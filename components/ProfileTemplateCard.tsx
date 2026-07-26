"use client";

import { useMemo, useState, useTransition } from "react";
import { ResumePreview, RESUME_FONTS, ACCENT_COLORS, normalizeTemplate, type TemplateId, type TemplateOption } from "@/components/templates";
import type { SectionKey } from "@/lib/sections";
import { SAMPLE_RESUME } from "@/lib/sampleResume";
import { updateProfileTemplateStyle } from "@/app/actions/profiles";

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const saveBtn =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900";

export type StyleSibling = { label: string; template: string; font: string; accent: string };

// Per-profile resume style (template + font family + accent color) with a live
// preview. Warns "slightly" when the chosen combination matches another profile,
// so each candidate's résumé looks distinct.
export function ProfileTemplateCard({
  profileId,
  initialTemplate,
  initialFont,
  initialAccent,
  order,
  templates,
  siblings,
}: {
  profileId: string;
  initialTemplate: string;
  initialFont: string;
  initialAccent: string;
  order: SectionKey[];
  templates: TemplateOption[];
  siblings: StyleSibling[];
}) {
  const [template, setTemplate] = useState<TemplateId>(normalizeTemplate(initialTemplate));
  const [font, setFont] = useState<string>(initialFont || "sans");
  const [accent, setAccent] = useState<string>(initialAccent || "sky");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const dirty = template !== normalizeTemplate(initialTemplate) || font !== (initialFont || "sans") || accent !== (initialAccent || "sky");

  // Live duplicate-style check across the client's other profiles.
  const clashes = useMemo(
    () => siblings.filter((s) => normalizeTemplate(s.template) === template && (s.font || "sans") === font && (s.accent || "sky") === accent).map((s) => s.label),
    [siblings, template, font, accent],
  );

  function save() {
    start(async () => {
      await updateProfileTemplateStyle(profileId, template, font, accent);
      setSaved(true);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Template
          <select value={template} onChange={(e) => { setTemplate(e.target.value as TemplateId); setSaved(false); }} className={`${input} max-w-xs`}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.label}: {t.description}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Font family
          <select value={font} onChange={(e) => { setFont(e.target.value); setSaved(false); }} className={`${input} w-44`}>
            {RESUME_FONTS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Accent color
          <select value={accent} onChange={(e) => { setAccent(e.target.value); setSaved(false); }} className={`${input} w-44`}>
            {ACCENT_COLORS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <button onClick={save} disabled={!dirty || pending} className={saveBtn}>{pending ? "Saving…" : "Save"}</button>
        {saved && !dirty && <span className="text-xs text-emerald-600">Saved.</span>}
      </div>

      {clashes.length > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ⚠ Same style as {clashes.length === 1 ? "" : `${clashes.length} other profiles: `}
          <span className="font-medium">{clashes.join(", ")}</span>. Consider a different template, font, or color so each candidate&apos;s résumé looks distinct.
        </p>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-neutral-500">Preview</div>
        <div className="max-h-[560px] overflow-auto rounded-lg border border-neutral-200 bg-neutral-100 p-4">
          <div className="print-sheet mx-auto" style={{ minHeight: 0 }}>
            <ResumePreview content={SAMPLE_RESUME} template={template} order={order} fontId={font} accentId={accent} />
          </div>
        </div>
      </div>
    </div>
  );
}
