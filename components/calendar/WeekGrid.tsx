"use client";

import { useEffect, useRef, useState } from "react";
import { weekDays, parseYmd, dowOf, onDay, minutesOf, fmtTime, colorOf, secondaryHourLabels, tzShort, localTimeZone, nowInTz, WEEKDAYS, type CalEvent } from "@/lib/calendar";
import { StageTag } from "@/components/calendar/StageTag";
import { MeetingIcon } from "@/components/calendar/MeetingIcon";

const HOUR_H = 44; // px per hour row
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const pad = (n: number) => String(n).padStart(2, "0");

export function WeekGrid({
  cursor,
  today,
  events,
  primaryTz,
  secondaryTz,
  onSlotClick,
  onEventClick,
}: {
  cursor: string;
  today: string;
  events: CalEvent[];
  primaryTz: string | null;
  secondaryTz: string | null;
  onSlotClick: (day: string, time: string) => void;
  onEventClick: (ev: CalEvent) => void;
}) {
  const days = weekDays(cursor);
  const anyAllDay = days.some((day) => events.some((e) => e.allDay && onDay(e, day)));
  const primaryAbbr = primaryTz ? tzShort(primaryTz, cursor) : "";
  const secLabels = secondaryTz ? secondaryHourLabels(primaryTz ?? localTimeZone(), secondaryTz, cursor) : null;

  // Live "current time" line — drawn in the display (primary) zone, which defaults
  // to the viewer's system zone, so it moves together with the grid + events when
  // a different zone is selected. Computed client-side and updated each minute, so
  // there is no SSR/hydration mismatch.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const now = nowMs != null ? nowInTz(primaryTz ?? localTimeZone()) : null;
  const showNow = !!now && days.includes(now.day);
  useEffect(() => {
    if (!scrolled.current && now && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (now.minutes / 60) * HOUR_H - 120);
      scrolled.current = true;
    }
  }, [nowMs, now]);
  // Header, all-day, and the hour grid all share these columns INSIDE one scroll
  // container, so the scrollbar shrinks them together and they stay aligned.
  const cols = `${secondaryTz ? "3.25rem 3.25rem" : "3.25rem"} repeat(7, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto">
        {/* Sticky header: day names + (optional) all-day row */}
        <div className="sticky top-0 z-20 bg-white">
          <div className="grid border-b border-neutral-200" style={{ gridTemplateColumns: cols }}>
            {secondaryTz && <GutterHead>{tzShort(secondaryTz, cursor)}</GutterHead>}
            <GutterHead>{primaryAbbr}</GutterHead>
            {days.map((day) => {
              const isToday = day === today;
              return (
                <div key={day} className="border-r border-neutral-100 py-1.5 text-center last:border-r-0">
                  <div className="text-[10px] uppercase text-neutral-500">{WEEKDAYS[dowOf(day)]}</div>
                  <div className={`mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm ${isToday ? "bg-sky-600 font-semibold text-white" : "text-neutral-800"}`}>{parseYmd(day).d}</div>
                </div>
              );
            })}
          </div>

          {anyAllDay && (
            <div className="grid border-b border-neutral-200 bg-neutral-50/60" style={{ gridTemplateColumns: cols }}>
              {secondaryTz && <div className="border-r border-neutral-100" />}
              <div className="flex items-start justify-end border-r border-neutral-100 px-1 pt-1 text-[9px] uppercase text-neutral-400">All-day</div>
              {days.map((day) => (
                <div key={day} className="min-h-[26px] space-y-0.5 border-r border-neutral-100 p-0.5 last:border-r-0">
                  {events.filter((e) => e.allDay && onDay(e, day)).map((e) => {
                    const c = colorOf(e.color);
                    return (
                      <button key={e.id} onClick={() => onEventClick(e)} title={e.company} className={`flex w-full items-center gap-1 truncate rounded px-1 text-left text-[11px] font-medium text-white ${c.bg}`}>
                        <StageTag step={e.step} />
                        <MeetingIcon type={e.meetingType} />
                        <span className="truncate">{e.company}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hour grid */}
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          {secLabels && <HourGutter labels={secLabels} />}
          <HourGutter labels={HOURS.map((h) => (h === 0 ? "" : fmtTime(`${pad(h)}:00`)))} />
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              events={events.filter((e) => !e.allDay && onDay(e, day))}
              nowMinutes={showNow && now!.day === day ? now!.minutes : null}
              onSlotClick={onSlotClick}
              onEventClick={onEventClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GutterHead({ children }: { children: React.ReactNode }) {
  return <div className="flex items-end justify-end border-r border-neutral-100 px-1 pb-1 text-[9px] font-medium text-neutral-400">{children}</div>;
}

function HourGutter({ labels }: { labels: string[] }) {
  return (
    <div className="relative border-r border-neutral-100" style={{ height: 24 * HOUR_H }}>
      {labels.map((l, h) => (
        <div key={h} className="absolute right-1 -translate-y-1/2 whitespace-nowrap text-[10px] text-neutral-400" style={{ top: h * HOUR_H }}>{l}</div>
      ))}
    </div>
  );
}

function DayColumn({ day, events, nowMinutes, onSlotClick, onEventClick }: { day: string; events: CalEvent[]; nowMinutes?: number | null; onSlotClick: (day: string, time: string) => void; onEventClick: (ev: CalEvent) => void }) {
  const placed = layoutLanes(events);
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const hour = Math.max(0, Math.min(23, Math.floor((e.clientY - rect.top) / HOUR_H)));
    onSlotClick(day, `${pad(hour)}:00`);
  }
  return (
    <div className="relative cursor-pointer border-r border-neutral-100 last:border-r-0 hover:bg-sky-50/30" style={{ height: 24 * HOUR_H }} onClick={handleClick}>
      {HOURS.map((h) => (
        <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-neutral-300" style={{ top: h * HOUR_H }} />
      ))}
      {nowMinutes != null && (
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: (nowMinutes / 60) * HOUR_H }}>
          <span className="absolute -left-[3px] -top-[5px] h-2 w-2 rounded-full bg-red-500" />
        </div>
      )}
      {placed.map(({ ev, lane, count }) => {
        const start = minutesOf(ev.startTime);
        const end = ev.endTime ? minutesOf(ev.endTime) : start + 60;
        const top = (start / 60) * HOUR_H;
        const height = Math.max(18, ((end - start) / 60) * HOUR_H - 2);
        const c = colorOf(ev.color);
        return (
          <button
            key={ev.id}
            onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
            title={`${fmtTime(ev.startTime)} ${ev.company}`}
            className={`absolute overflow-hidden rounded px-1 py-0.5 text-left text-[11px] leading-tight text-white ${c.bg}`}
            style={{ top, height, left: `calc(${(lane / count) * 100}% + 1px)`, width: `calc(${(1 / count) * 100}% - 2px)` }}
          >
            <div className="flex items-center gap-1 truncate"><StageTag step={ev.step} /><MeetingIcon type={ev.meetingType} /><span className="truncate font-medium">{ev.company}</span></div>
            {height > 28 && <div className="truncate opacity-90">{fmtTime(ev.startTime)}</div>}
          </button>
        );
      })}
    </div>
  );
}

// Greedy lane assignment so overlapping events split a day column side by side.
function layoutLanes(events: CalEvent[]): { ev: CalEvent; lane: number; count: number }[] {
  const sorted = [...events].sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime));
  const out: { ev: CalEvent; lane: number; count: number }[] = [];
  let cluster: { ev: CalEvent; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const count = laneEnds.length || 1;
    for (const p of cluster) out.push({ ev: p.ev, lane: p.lane, count });
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  for (const ev of sorted) {
    const s = minutesOf(ev.startTime);
    const e = ev.endTime ? minutesOf(ev.endTime) : s + 60;
    if (cluster.length && s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
    cluster.push({ ev, lane });
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return out;
}
