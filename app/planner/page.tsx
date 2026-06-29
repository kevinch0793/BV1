import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/auth";
import { ymd, type CalEvent } from "@/lib/calendar";
import { CalendarApp } from "@/components/calendar/CalendarApp";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const { id: clientId } = await requireClient();
  const [events, profiles] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { clientId }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    prisma.profile.findMany({ where: { clientId }, orderBy: { createdAt: "asc" }, select: { id: true, fullName: true, label: true, phone: true } }),
  ]);

  const evs: CalEvent[] = events.map((e) => ({
    id: e.id, profileId: e.profileId, title: e.title, date: e.date, endDate: e.endDate,
    allDay: e.allDay, startTime: e.startTime, endTime: e.endTime, note: e.note,
    meetingType: e.meetingType === "phone" || e.meetingType === "video" ? e.meetingType : null,
    meetingLink: e.meetingLink, step: e.step, color: e.color,
  }));
  const profs = profiles.map((p) => ({ id: p.id, name: p.fullName || p.label, phone: p.phone }));

  // Server's local "today" — for a local install this is the user's real day, and
  // passing it (vs computing in the client) keeps SSR and hydration consistent.
  return <CalendarApp events={evs} profiles={profs} today={ymd(new Date())} />;
}
