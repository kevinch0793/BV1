-- Admin notice shown to every signed-in client.
--
-- Hand-written as four plain ALTER TABLE ADD COLUMN statements. SQLite supports
-- these in place, so the table is NOT redefined — which matters here, because a
-- generated table-redefinition migration on this schema has previously produced
-- drift trouble. Adding columns keeps existing AppConfig rows untouched.
ALTER TABLE "AppConfig" ADD COLUMN "noticeText" TEXT;
ALTER TABLE "AppConfig" ADD COLUMN "noticeKind" TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "AppConfig" ADD COLUMN "noticeActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppConfig" ADD COLUMN "noticeUpdatedAt" DATETIME;
