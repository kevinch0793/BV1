-- Reason for an event's outcome (e.g. why an interview failed).
ALTER TABLE "CalendarEvent" ADD COLUMN "statusNote" TEXT;
