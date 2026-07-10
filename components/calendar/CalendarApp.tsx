"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, monthTitle, weekTitle, listTimeZones, localTimeZone, toDisplayEvent, nowInTz, type CalEvent, type EventInput } from "@/lib/calendar";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { WeekGrid } from "@/components/calendar/WeekGrid";
import { EventModal, type Draft } from "@/components/calendar/EventModal";

const pad = (n: number) => String(n).padStart(2, "0");
function addHour(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  return `${pad((h + 1) % 24)}:${pad(m)}`;
}
function blankInput(day: string, time: string | undefined, timeZone: string): EventInput {
  const start = time ?? "09:00";
  return {
    company: "", role: null, date: day, endDate: null,
    allDay: false, startTime: start, endTime: addHour(start), timeZone,
    note: null, meetingType: "video", meetingLink: null, step: null, status: null, statusNote: null, color: "sky", profileId: null,
  };
}

export function CalendarApp({ events, profiles, today }: { events: CalEvent[]; profiles: { id: string; name: string; phone: string | null }[]; today: string }) {
  const [view, setView] = useState<"month" | "week">("week");
  const [cursor, setCursor] = useState(today);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [primaryTz, setPrimaryTz] = useState<string | null>(null);
  const [secondaryTz, setSecondaryTz] = useState<string | null>(null);
  const zones = useMemo(() => listTimeZones(), []);

  // Show every event in the display (primary) zone — which defaults to the
  // viewer's system zone — so an interview reads in local time everywhere.
  // Converting only after primaryTz is known (post-mount) keeps SSR/hydration
  // stable: events render at their stored wall-clock for one frame, then snap
  // into the local zone.
  const displayTz = primaryTz ?? localTimeZone();
  const displayEvents = useMemo(() => (primaryTz ? events.map((e) => toDisplayEvent(e, primaryTz)) : events), [events, primaryTz]);
  const displayToday = primaryTz ? nowInTz(primaryTz).day : today;

  // Restore saved time zones after mount (client-only — no SSR/hydration mismatch).
  // Primary defaults to the browser's local zone; both are editable.
  useEffect(() => {
    try {
      setPrimaryTz(localStorage.getItem("planner.primaryTz") || localTimeZone());
      const s = localStorage.getItem("planner.secondaryTz");
      if (s) setSecondaryTz(s);
    } catch {
      setPrimaryTz(localTimeZone());
    }
  }, []);
  const save = (key: string, v: string | null) => {
    try {
      if (v) localStorage.setItem(key, v);
      else localStorage.removeItem(key);
    } catch { /* ignore */ }
  };
  const changePrimary = (v: string) => { setPrimaryTz(v); save("planner.primaryTz", v); };
  const changeSecondary = (v: string | null) => { setSecondaryTz(v); save("planner.secondaryTz", v); };

  const title = view === "month" ? monthTitle(cursor) : weekTitle(cursor);
  const step = (dir: number) => setCursor(view === "month" ? addMonths(cursor, dir) : addDays(cursor, dir * 7));

  const openCreate = (day: string, time?: string) => setDraft({ mode: "create", init: blankInput(day, time, displayTz) });
  const openEdit = (ev: CalEvent) =>
    setDraft({
      mode: "edit",
      event: ev,
      init: { company: ev.company, role: ev.role, date: ev.date, endDate: null, allDay: false, startTime: ev.startTime ?? "09:00", endTime: ev.endTime ?? addHour(ev.startTime ?? "09:00"), timeZone: displayTz, note: ev.note, meetingType: ev.meetingType, meetingLink: ev.meetingLink, step: ev.step, status: ev.status, statusNote: ev.statusNote, color: ev.color, profileId: ev.profileId },
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">Planner</h1>
        <button onClick={() => openCreate(displayToday)} className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800">+ Create event</button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(displayToday)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">Today</button>
          <div className="flex items-center">
            <button onClick={() => step(-1)} aria-label="Previous" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button onClick={() => step(1)} aria-label="Next" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
          <div className="text-lg font-semibold text-neutral-900">{title}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === "week" && (
            <>
              <select
                value={primaryTz ?? ""}
                onChange={(e) => changePrimary(e.target.value)}
                title="Primary time zone (the grid's hours)"
                className="max-w-[11rem] rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="" disabled>Time zone…</option>
                {zones.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
              <select
                value={secondaryTz ?? ""}
                onChange={(e) => changeSecondary(e.target.value || null)}
                title="Second time zone shown alongside the primary"
                className="max-w-[11rem] rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">+ 2nd time zone</option>
                {zones.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </>
          )}
          <div className="flex gap-1 rounded-lg border border-neutral-200 p-1">
            {(["month", "week"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${view === v ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid cursor={cursor} today={displayToday} events={displayEvents} onDayClick={(d) => openCreate(d)} onEventClick={openEdit} onMore={(d) => { setCursor(d); setView("week"); }} />
      ) : (
        <WeekGrid cursor={cursor} today={displayToday} events={displayEvents} primaryTz={primaryTz} secondaryTz={secondaryTz} onSlotClick={(d, t) => openCreate(d, t)} onEventClick={openEdit} />
      )}

      <p className="text-xs text-neutral-400">Click a day{view === "week" ? " or time slot" : ""} to add an event; click an event to edit or delete it.</p>

      {draft && <EventModal draft={draft} profiles={profiles} onClose={() => setDraft(null)} />}
    </div>
  );
}
