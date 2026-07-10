-- Interview outcome per calendar event: advanced | pending | failed (null = unset).
ALTER TABLE "CalendarEvent" ADD COLUMN "status" TEXT;
