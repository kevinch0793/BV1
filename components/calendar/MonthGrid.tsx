"use client";

import { monthMatrix, parseYmd, onDay, cmpEvent, colorOf, fmtTime, WEEKDAYS, type CalEvent } from "@/lib/calendar";
import { StageTag } from "@/components/calendar/StageTag";
import { StatusIcon } from "@/components/calendar/StatusIcon";
import { MeetingIcon } from "@/components/calendar/MeetingIcon";

export function MonthGrid({
  cursor,
  today,
  events,
  onDayClick,
  onEventClick,
  onMore,
}: {
  cursor: string;
  today: string;
  events: CalEvent[];
  onDayClick: (day: string) => void;
  onEventClick: (ev: CalEvent) => void;
  onMore: (day: string) => void;
}) {
  const weeks = monthMatrix(cursor);
  const curMonth = parseYmd(cursor).m;

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50 text-center text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((day, i) => {
          const inMonth = parseYmd(day).m === curMonth;
          const isToday = day === today;
          const dayEvents = events.filter((e) => onDay(e, day)).sort(cmpEvent);
          const shown = dayEvents.slice(0, 3);
          const more = dayEvents.length - shown.length;
          return (
            <div
              key={day}
              onClick={() => onDayClick(day)}
              className={`min-h-[108px] cursor-pointer border-b border-r border-neutral-100 p-1 ${i % 7 === 6 ? "border-r-0" : ""} ${i >= 35 ? "border-b-0" : ""} ${inMonth ? "bg-white" : "bg-neutral-50/60"} hover:bg-sky-50/40`}
            >
              <div className="flex justify-end">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${isToday ? "bg-sky-600 font-semibold text-white" : inMonth ? "text-neutral-700" : "text-neutral-400"}`}>
                  {parseYmd(day).d}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {shown.map((e) => (
                  <MonthChip key={e.id} ev={e} onClick={() => onEventClick(e)} />
                ))}
                {more > 0 && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onMore(day); }}
                    className="px-1 text-[11px] font-medium text-neutral-500 hover:text-sky-700"
                  >
                    +{more} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthChip({ ev, onClick }: { ev: CalEvent; onClick: () => void }) {
  const c = colorOf(ev.color);
  const failed = ev.status === "failed";
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); onClick(); };
  if (ev.allDay) {
    return (
      <button onClick={stop} title={ev.company} className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white ${c.bg} ${failed ? "opacity-60" : ""}`}>
        <StatusIcon status={ev.status} />
        <StageTag step={ev.step} />
        <MeetingIcon type={ev.meetingType} />
        <span className={`truncate ${failed ? "line-through" : ""}`}>{ev.company}</span>
      </button>
    );
  }
  return (
    <button onClick={stop} title={`${fmtTime(ev.startTime)} ${ev.company}`} className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] text-neutral-700 hover:bg-neutral-100 ${failed ? "opacity-60" : ""}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${c.bg}`} />
      {ev.startTime && <span className="shrink-0 text-neutral-500">{fmtTime(ev.startTime)}</span>}
      <StatusIcon status={ev.status} />
      <StageTag step={ev.step} />
      <MeetingIcon type={ev.meetingType} />
      <span className={`truncate ${failed ? "line-through" : ""}`}>{ev.company}</span>
    </button>
  );
}
