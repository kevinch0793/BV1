"use client";

import { useState } from "react";
import { addDays, addMonths, monthTitle, weekTitle, type CalEvent, type EventInput } from "@/lib/calendar";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { WeekGrid } from "@/components/calendar/WeekGrid";
import { EventModal, type Draft } from "@/components/calendar/EventModal";

const pad = (n: number) => String(n).padStart(2, "0");
function addHour(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  return `${pad((h + 1) % 24)}:${pad(m)}`;
}
function blankInput(day: string, time?: string): EventInput {
  return time
    ? { title: "", date: day, endDate: null, allDay: false, startTime: time, endTime: addHour(time), location: null, note: null, color: "sky", profileId: null }
    : { title: "", date: day, endDate: null, allDay: true, startTime: null, endTime: null, location: null, note: null, color: "sky", profileId: null };
}

export function CalendarApp({ events, profiles, today }: { events: CalEvent[]; profiles: { id: string; name: string }[]; today: string }) {
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(today);
  const [draft, setDraft] = useState<Draft | null>(null);

  const title = view === "month" ? monthTitle(cursor) : weekTitle(cursor);
  const step = (dir: number) => setCursor(view === "month" ? addMonths(cursor, dir) : addDays(cursor, dir * 7));

  const openCreate = (day: string, time?: string) => setDraft({ mode: "create", init: blankInput(day, time) });
  const openEdit = (ev: CalEvent) =>
    setDraft({
      mode: "edit",
      event: ev,
      init: { title: ev.title, date: ev.date, endDate: ev.endDate, allDay: ev.allDay, startTime: ev.startTime, endTime: ev.endTime, location: ev.location, note: ev.note, color: ev.color, profileId: ev.profileId },
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">Planner</h1>
        <button onClick={() => openCreate(today)} className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800">+ Create event</button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(today)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">Today</button>
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

        <div className="flex gap-1 rounded-lg border border-neutral-200 p-1">
          {(["month", "week"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${view === v ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{v}</button>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid cursor={cursor} today={today} events={events} onDayClick={(d) => openCreate(d)} onEventClick={openEdit} onMore={(d) => { setCursor(d); setView("week"); }} />
      ) : (
        <WeekGrid cursor={cursor} today={today} events={events} onSlotClick={(d, t) => openCreate(d, t)} onEventClick={openEdit} />
      )}

      <p className="text-xs text-neutral-400">Click a day{view === "week" ? " or time slot" : ""} to add an event; click an event to edit or delete it.</p>

      {draft && <EventModal draft={draft} profiles={profiles} onClose={() => setDraft(null)} />}
    </div>
  );
}
