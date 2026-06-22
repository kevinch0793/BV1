"use client";

import { useState } from "react";
import { ResumePreview, TEMPLATES, type TemplateId } from "@/components/templates";
import type { SectionKey } from "@/lib/sections";
import type { ResumeContent } from "@/lib/llm/schema";
import { downloadResume } from "@/lib/exportClient";

type FitDetail = { matched?: string[]; missing?: string[] };

export function SavedResumeView({
  tailoredId,
  content,
  templateId,
  order,
  fitBefore,
  fitAfter,
  fitDetail,
}: {
  tailoredId: string;
  content: ResumeContent;
  templateId: TemplateId;
  order: SectionKey[];
  fitBefore: number | null;
  fitAfter: number | null;
  fitDetail: FitDetail | null;
}) {
  const [template, setTemplate] = useState<TemplateId>(templateId);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const hasFit = fitAfter != null;
  const delta = fitBefore != null && fitAfter != null ? fitAfter - fitBefore : null;

  // One-click download: hit the export endpoint (Content-Disposition: attachment),
  // so the file saves directly with no browser print dialog.
  async function download(format: "pdf" | "docx") {
    setDownloading(format);
    try {
      await downloadResume(tailoredId, format, { template, order: order.join(",") });
    } catch (e) {
      alert(`Download failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setDownloading(null);
    }
  }

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => download("pdf")}
            disabled={downloading !== null}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {downloading === "pdf" ? "Preparing…" : "Download PDF"}
          </button>
          <button
            onClick={() => download("docx")}
            disabled={downloading !== null}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            {downloading === "docx" ? "Preparing…" : "Download DOCX"}
          </button>
        </div>
      </div>

      {hasFit && (
        <div className="no-print rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="text-sm font-semibold text-neutral-900">ATS match</div>
            <Stat label="Before" value={fitBefore} muted />
            <span className="text-neutral-300">→</span>
            <Stat label="After" value={fitAfter} />
            {delta != null && (
              <span className={`rounded px-2 py-0.5 text-sm font-medium ${delta >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                {delta >= 0 ? "+" : ""}{delta} pts
              </span>
            )}
          </div>
          {fitDetail && (
            <div className="mt-3 space-y-2 text-xs">
              {fitDetail.matched && fitDetail.matched.length > 0 && (
                <ChipRow label="Matched JD skills" chips={fitDetail.matched} tone="bg-emerald-50 text-emerald-700 border-emerald-200" />
              )}
              {fitDetail.missing && fitDetail.missing.length > 0 && (
                <ChipRow label="Still missing" chips={fitDetail.missing} tone="bg-amber-50 text-amber-700 border-amber-200" />
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] text-neutral-400">
            Keyword/skill coverage of the JD (must-haves weighted) — an ATS-style match estimate, not a specific employer&apos;s parser.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="print-sheet mx-auto">
          <ResumePreview content={content} template={template} order={order} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: number | null; muted?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className={`text-2xl font-bold ${muted ? "text-neutral-400" : "text-sky-700"}`}>{value ?? "—"}%</span>
    </div>
  );
}

function ChipRow({ label, chips, tone }: { label: string; chips: string[]; tone: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-neutral-500">{label}:</span>
      {chips.map((c, i) => (
        <span key={i} className={`rounded border px-1.5 py-0.5 ${tone}`}>{c}</span>
      ))}
    </div>
  );
}
