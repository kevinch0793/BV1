-- Manually-managed calendar events (Google/Outlook-style).
CREATE TABLE "CalendarEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "profileId" TEXT,
  "title" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "endDate" TEXT,
  "allDay" BOOLEAN NOT NULL DEFAULT true,
  "startTime" TEXT,
  "endTime" TEXT,
  "location" TEXT,
  "note" TEXT,
  "color" TEXT NOT NULL DEFAULT 'sky',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CalendarEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CalendarEvent_clientId_date_idx" ON "CalendarEvent"("clientId", "date");
