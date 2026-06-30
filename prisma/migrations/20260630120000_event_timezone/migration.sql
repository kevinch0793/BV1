-- Anchor calendar events to a time zone so they can be shown in each viewer's
-- local zone. Existing events were authored in Eastern time.
ALTER TABLE "CalendarEvent" ADD COLUMN "timeZone" TEXT;
UPDATE "CalendarEvent" SET "timeZone" = 'America/New_York' WHERE "timeZone" IS NULL;
