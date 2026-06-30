"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/auth";
import { EVENT_COLORS, EVENT_STAGES, type EventInput } from "@/lib/calendar";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

// Accept a client-supplied IANA zone only if the runtime recognizes it; else fall
// back to Eastern (the zone existing events are anchored to).
function validTimeZone(tz: unknown): string {
  if (typeof tz === "string" && tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      /* invalid zone */
    }
  }
  return "America/New_York";
}

// Sanitize untrusted client input into a storable event (or null if invalid).
function clean(input: EventInput) {
  const company = (input.company ?? "").trim().slice(0, 200);
  const date = input.date ?? "";
  if (!company || !DAY.test(date)) return null;
  const allDay = !!input.allDay;
  const color = EVENT_COLORS.some((c) => c.id === input.color) ? input.color : "sky";
  const endDate = input.endDate && DAY.test(input.endDate) && input.endDate >= date ? input.endDate : null;
  const startTime = !allDay && input.startTime && TIME.test(input.startTime) ? input.startTime : null;
  let endTime = !allDay && input.endTime && TIME.test(input.endTime) ? input.endTime : null;
  if (startTime && endTime && endTime < startTime) endTime = null; // ignore a bad range
  const meetingType = input.meetingType === "phone" || input.meetingType === "video" ? input.meetingType : null;
  return {
    timeZone: allDay ? null : validTimeZone(input.timeZone),
    company,
    role: (input.role ?? "").trim().slice(0, 200) || null,
    title: company, // keep the legacy NOT NULL column in sync with company
    date,
    endDate,
    allDay,
    startTime,
    endTime,
    note: (input.note ?? "").trim().slice(0, 2000) || null,
    meetingType,
    meetingLink: meetingType === "video" ? (input.meetingLink ?? "").trim().slice(0, 500) || null : null,
    step: EVENT_STAGES.some((s) => s.id === input.step) ? input.step : null,
    color,
    profileId: (input.profileId ?? "").trim() || null,
  };
}

export async function createEvent(input: EventInput): Promise<{ ok: boolean }> {
  const { id: clientId } = await requireClient();
  const data = clean(input);
  if (!data) return { ok: false };
  await prisma.calendarEvent.create({ data: { clientId, ...data } });
  revalidatePath("/planner");
  return { ok: true };
}

export async function updateEvent(id: string, input: EventInput): Promise<{ ok: boolean }> {
  const { id: clientId } = await requireClient();
  const data = clean(input);
  if (!data) return { ok: false };
  await prisma.calendarEvent.updateMany({ where: { id, clientId }, data });
  revalidatePath("/planner");
  return { ok: true };
}

export async function deleteEvent(id: string): Promise<void> {
  const { id: clientId } = await requireClient();
  await prisma.calendarEvent.deleteMany({ where: { id, clientId } });
  revalidatePath("/planner");
}
