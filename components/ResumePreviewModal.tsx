"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ResumePreview, normalizeTemplate } from "@/components/templates";
import { previewTailored, type TailoredPreview } from "@/app/actions/tailor";
import { downloadResume } from "@/lib/exportClient";
import { saveResumeToDownloads } from "@/app/actions/export";
import { fitColor } from "@/lib/fit";

export function ResumePreviewModal({ tailoredId, onClose }: { tailoredId: string; onClose: () => void }) {
  const [data, setData] = useState<TailoredPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    previewTailored(tailoredId)
      .then((r) => active && (r ? setData(r) : setError("Resume not found.")))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load."));
    return () => {
      active = false;
    };
  }, [tailoredId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function download(format: "pdf" | "docx") {
    setDownloading(format);
    setSavedMsg(null);
    try {
      const r = await saveResumeToDownloads(tailoredId, format);
      if (r.ok) setSavedMsg(`Saved to Downloads/${r.path.split("/").pop()}`);
      else {
        await downloadResume(tailoredId, format);
        setSavedMsg("Downloaded.");
      }
    } catch (e) {
      alert(`Download failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setDownloading(null);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-4xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            Resume preview
            {savedMsg && <span className="text-xs font-normal text-emerald-600">{savedMsg}</span>}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => download("pdf")}
              disabled={!data || downloading !== null}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {downloading === "pdf" ? "Preparing…" : "Download PDF"}
            </button>
            <button
              onClick={() => download("docx")}
              disabled={!data || downloading !== null}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
            >
              {downloading === "docx" ? "Preparing…" : "DOCX"}
            </button>
            <button onClick={onClose} className="rounded-md px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100">
              Close ✕
            </button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-auto bg-neutral-100 p-4">
          {error && <p className="py-10 text-center text-sm text-red-600">{error}</p>}
          {!data && !error && <p className="py-10 text-center text-sm text-neutral-400">Loading…</p>}
          {data && data.fitAfter != null && <FitPanel data={data} />}
          {data && (
            <div className="print-sheet mx-auto">
              <ResumePreview content={data.content} template={normalizeTemplate(data.template)} order={data.order} fontId={data.resumeFont} fontScale={data.resumeFontScale} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FitPanel({ data }: { data: TailoredPreview }) {
  const delta = data.fitBefore != null && data.fitAfter != null ? data.fitAfter - data.fitBefore : null;
  const matched = data.fitDetail?.matched ?? [];
  const missing = data.fitDetail?.missing ?? [];
  return (
    <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="text-sm font-semibold text-neutral-900">ATS match</div>
        {data.fitBefore != null && (
          <>
            <Stat label="Before" value={data.fitBefore} />
            <span className="text-neutral-300">→</span>
          </>
        )}
        <Stat label="After" value={data.fitAfter} />
        {delta != null && (
          <span className={`rounded px-2 py-0.5 text-sm font-medium ${delta >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
            {delta >= 0 ? "+" : ""}{delta} pts
          </span>
        )}
      </div>
      {(matched.length > 0 || missing.length > 0) && (
        <div className="mt-3 space-y-2 text-xs">
          {matched.length > 0 && <ChipRow label="Matched JD skills" chips={matched} tone="bg-emerald-50 text-emerald-700 border-emerald-200" />}
          {missing.length > 0 && <ChipRow label="Still missing" chips={missing} tone="bg-amber-50 text-amber-700 border-amber-200" />}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span
        className="rounded-md px-2 py-0.5 text-xl font-bold"
        style={value == null ? { color: "#a3a3a3" } : { backgroundColor: fitColor(value).bg, color: fitColor(value).text }}
      >
        {value ?? "—"}%
      </span>
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
