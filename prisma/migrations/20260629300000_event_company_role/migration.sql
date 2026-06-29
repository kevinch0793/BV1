-- Split interview events into company + role; backfill company from the old title.
ALTER TABLE "CalendarEvent" ADD COLUMN "company" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "role" TEXT;
UPDATE "CalendarEvent" SET "company" = "title" WHERE "company" IS NULL;
