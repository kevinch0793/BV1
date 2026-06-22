"use client";

import { useState, useTransition } from "react";
import { ResumePreview, TEMPLATES, normalizeTemplate, type TemplateId } from "@/components/templates";
import type { SectionKey } from "@/lib/sections";
import type { ResumeContent } from "@/lib/llm/schema";
import { updateDefaultTemplate } from "@/app/actions/settings";

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const saveBtn =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900";

// Representative content so every template feature shows in the preview.
const SAMPLE: ResumeContent = {
  name: "Alex Rivera",
  title: "Software Engineer",
  contact: {
    email: "alex.rivera@email.com",
    phone: "(555) 123-4567",
    location: "Remote",
    links: [
      { label: "github.com/alexr", url: "https://github.com/alexr" },
      { label: "linkedin.com/in/alexr", url: "https://linkedin.com/in/alexr" },
    ],
  },
  summary:
    "Software Engineer with 6 years building reliable backend services and ML-backed features in Agile teams, shipping to production with AI dev tools like Claude Code and GitHub Copilot CLI. Focused on distributed systems, clean APIs, and measurable impact.",
  skills: [
    { category: "Languages", items: ["Go", "Python", "TypeScript", "SQL"] },
    { category: "Infrastructure", items: ["Kubernetes", "AWS", "Terraform", "Kafka"] },
    { category: "Practices & Tools", items: ["Agile", "CI/CD", "Claude Code", "GitHub Copilot CLI"] },
  ],
  experience: [
    {
      company: "Northwind Labs",
      role: "Senior Software Engineer",
      location: "Remote",
      startDate: "Jan 2022",
      endDate: "Present",
      projects: [
        {
          name: "Payments Platform",
          type: "Distributed services",
          bullets: [
            "Led a 4-engineer team rebuilding the payments pipeline, cutting p99 latency 38% while handling 12K req/s.",
            "Designed idempotent transaction APIs adopted by 7 downstream teams.",
            "Used Claude Code and Copilot CLI to accelerate code review and refactors across the service.",
            "Introduced contract tests in CI, reducing integration regressions to near zero.",
          ],
        },
      ],
    },
    {
      company: "Brightseed",
      role: "Software Engineer",
      location: "Austin, TX",
      startDate: "Jun 2019",
      endDate: "Dec 2021",
      projects: [
        {
          name: "",
          type: "",
          bullets: [
            "Built a feature store powering 3 ML models, improving inference freshness from hours to minutes.",
            "Collaborated in an Agile team to ship a customer dashboard used by 20K monthly users.",
            "Owned on-call for core APIs, raising uptime to 99.95%.",
          ],
        },
      ],
    },
  ],
  education: [
    {
      school: "University of Texas at Austin",
      degree: "B.S.",
      field: "Computer Science",
      startDate: "2015",
      endDate: "2019",
      details: "GPA 3.8",
    },
  ],
};

export function TemplateSettings({ initial, order }: { initial: string; order: SectionKey[] }) {
  const [template, setTemplate] = useState<TemplateId>(normalizeTemplate(initial));
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = template !== normalizeTemplate(initial);

  function save() {
    start(async () => {
      await updateDefaultTemplate(template);
      setSaved(true);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Template
          <select
            value={template}
            onChange={(e) => {
              setTemplate(e.target.value as TemplateId);
              setSaved(false);
            }}
            className={`${input} max-w-xs`}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}: {t.description}</option>
            ))}
          </select>
        </label>
        <button onClick={save} disabled={!dirty || pending} className={saveBtn}>
          {pending ? "Saving…" : "Save template"}
        </button>
        {saved && !dirty && <span className="text-xs text-emerald-600">Saved.</span>}
      </div>

      {/* Live preview — updates the moment you change the template. */}
      <div>
        <div className="mb-1 text-xs font-medium text-neutral-500">Preview</div>
        <div className="max-h-[560px] overflow-auto rounded-lg border border-neutral-200 bg-neutral-100 p-4">
          <div className="print-sheet mx-auto" style={{ minHeight: 0 }}>
            <ResumePreview content={SAMPLE} template={template} order={order} />
          </div>
        </div>
      </div>
    </div>
  );
}
