-- Global company blacklist: companies the platform never applies to, one per line.
--
-- Hand-written as a single ALTER TABLE ADD COLUMN, matching the admin-notice
-- migration: SQLite adds the column in place, so the table is NOT redefined and
-- existing AppConfig rows are untouched. Nullable with no default, so the single
-- "global" row needs no backfill and an empty list simply means "block nothing".
ALTER TABLE "AppConfig" ADD COLUMN "companyBlacklist" TEXT;
