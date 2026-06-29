"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EVENT_COLORS, longDate, type CalEvent, type EventInput } from "@/lib/calendar";
import { createEvent, updateEvent, deleteEvent } from "@/app/actions/calendar";

export type Draft = { mode: "create" | "edit"; event?: CalEvent; init: EventInput };

const inputCls = "rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

export function EventModal({ draft, profiles, onClose }: { draft: Draft; profiles: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<EventInput>(draft.init);
  const [pending, setPending] = useState(false);
  const isEdit = draft.mode === "edit";
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.title.trim() || pending) return;
    setPending(true);
    const res = isEdit ? await updateEvent(draft.event!.id, f) : await createEvent(f);
    if (res.ok) { router.refresh(); onClose(); } else setPending(false);
  }
  async function remove() {
    if (pending) return;
    setPending(true);
    await deleteEvent(draft.event!.id);
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/30 p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">{isEdit ? "Edit event" : "New event"}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-3 p-4">
          <input
            autoFocus
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="Add title"
            className={`${inputCls} w-full text-base font-medium`}
          />

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={f.allDay} onChange={(e) => set("allDay", e.target.checked)} className="h-4 w-4 rounded border-neutral-300 text-sky-600 focus:ring-sky-500" />
            All-day
          </label>

          {f.allDay ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Field label="Date"><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={inputCls} /></Field>
              <Field label="End (optional)"><input type="date" value={f.endDate ?? ""} min={f.date} onChange={(e) => set("endDate", e.target.value || null)} className={inputCls} /></Field>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Field label="Date"><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={inputCls} /></Field>
              <Field label="Start"><input type="time" value={f.startTime ?? ""} onChange={(e) => set("startTime", e.target.value || null)} className={inputCls} /></Field>
              <Field label="End"><input type="time" value={f.endTime ?? ""} onChange={(e) => set("endTime", e.target.value || null)} className={inputCls} /></Field>
            </div>
          )}

          <input value={f.location ?? ""} onChange={(e) => set("location", e.target.value || null)} placeholder="Add location" className={`${inputCls} w-full`} />
          <textarea value={f.note ?? ""} onChange={(e) => set("note", e.target.value || null)} placeholder="Add notes" rows={3} className={`${inputCls} w-full`} />

          <div>
            <div className="mb-1 text-xs font-medium text-neutral-500">Color</div>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => set("color", c.id)}
                  title={c.name}
                  className={`h-6 w-6 rounded-full ${c.bg} ${f.color === c.id ? "ring-2 ring-neutral-900 ring-offset-1" : ""}`}
                />
              ))}
            </div>
          </div>

          {profiles.length > 0 && (
            <Field label="Profile (optional)">
              <select value={f.profileId ?? ""} onChange={(e) => set("profileId", e.target.value || null)} className={inputCls}>
                <option value="">None</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-4 py-3">
          {isEdit ? (
            <button onClick={remove} disabled={pending} className="rounded-md px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40">Delete</button>
          ) : (
            <span className="text-xs text-neutral-400">{longDate(f.date)}</span>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Cancel</button>
            <button onClick={save} disabled={pending || !f.title.trim()} className="rounded-md bg-sky-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-40">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
