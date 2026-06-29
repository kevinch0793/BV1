"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EVENT_COLORS, EVENT_STAGES, longDate, type CalEvent, type EventInput } from "@/lib/calendar";
import { createEvent, updateEvent, deleteEvent } from "@/app/actions/calendar";

export type Draft = { mode: "create" | "edit"; event?: CalEvent; init: EventInput };

const inputCls = "rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

export function EventModal({ draft, profiles, onClose }: { draft: Draft; profiles: { id: string; name: string; phone: string | null }[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<EventInput>(draft.init);
  const [pending, setPending] = useState(false);
  const isEdit = draft.mode === "edit";
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const selectedProfile = profiles.find((p) => p.id === f.profileId) ?? null;

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
            placeholder="Add interview title"
            className={`${inputCls} w-full text-base font-medium`}
          />

          <Field label="Stage">
            <select value={f.step ?? ""} onChange={(e) => set("step", e.target.value || null)} className={inputCls}>
              <option value="">No stage</option>
              {EVENT_STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Field>

          {/* Interview meeting type + its body (phone -> profile's number, video -> link) */}
          <div className="flex w-fit gap-1 rounded-lg border border-neutral-200 p-1">
            {(["phone", "video"] as const).map((t) => (
              <button
                key={t}
                onClick={() => set("meetingType", t)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${f.meetingType === t ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
              >
                {t === "phone" ? <PhoneIcon /> : <VideoIcon />}
                {t === "phone" ? "Phone call" : "Video call"}
              </button>
            ))}
          </div>

          {profiles.length > 0 && (
            <Field label="Profile / candidate">
              <select value={f.profileId ?? ""} onChange={(e) => set("profileId", e.target.value || null)} className={inputCls}>
                <option value="">None</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}

          {f.meetingType === "phone" && (
            <div className="rounded-md bg-neutral-50 px-3 py-2 text-sm">
              {selectedProfile?.phone ? (
                <span className="flex flex-wrap items-center gap-2 text-neutral-700">
                  <PhoneIcon />
                  <a href={`tel:${selectedProfile.phone}`} className="font-medium text-sky-700 hover:underline">{selectedProfile.phone}</a>
                  <span className="text-xs text-neutral-400">from {selectedProfile.name}</span>
                </span>
              ) : (
                <span className="text-xs text-amber-600">
                  {selectedProfile ? `${selectedProfile.name} has no phone number — add one on the profile.` : "Pick a profile above to use its phone number."}
                </span>
              )}
            </div>
          )}

          {f.meetingType === "video" && (
            <Field label="Video link">
              <input
                value={f.meetingLink ?? ""}
                onChange={(e) => set("meetingLink", e.target.value || null)}
                placeholder="Paste meeting link (Zoom, Meet, Teams…)"
                className={`${inputCls} w-full`}
              />
            </Field>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Field label="Date"><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={inputCls} /></Field>
            <Field label="Start"><input type="time" value={f.startTime ?? ""} onChange={(e) => set("startTime", e.target.value || null)} className={inputCls} /></Field>
            <Field label="End"><input type="time" value={f.endTime ?? ""} onChange={(e) => set("endTime", e.target.value || null)} className={inputCls} /></Field>
          </div>

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

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m23 7-7 5 7 5V7Z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}
