-- Interview meeting fields on calendar events.
ALTER TABLE "CalendarEvent" ADD COLUMN "meetingType" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "meetingLink" TEXT;
