"use client";

import { useState } from "react";
import { ResumePreview, TEMPLATES, type TemplateId } from "@/components/templates";
import type { ResumeContent } from "@/lib/llm/schema";

export function SavedResumeView({
  content,
  templateId,
}: {
  content: ResumeContent;
  templateId: TemplateId;
}) {
  const [template, setTemplate] = useState<TemplateId>(templateId);
  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplate(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${template === t.id ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => window.print()} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700">
          Download PDF
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="print-sheet mx-auto">
          <ResumePreview content={content} template={template} />
        </div>
      </div>
    </div>
  );
}
