-- JobPosting had no index beyond the implicit unique one, so every lookup by
-- profile (the pipeline queue, the mid-flight status recovery, the dashboard's
-- day view re-rendered on each poll) scanned the whole table.
-- IF NOT EXISTS: these were also created directly against the running database,
-- so this migration is a no-op there and applies normally on a fresh volume.
CREATE INDEX IF NOT EXISTS "JobPosting_profileId_status_idx" ON "JobPosting"("profileId", "status");
CREATE INDEX IF NOT EXISTS "JobPosting_profileId_createdAt_idx" ON "JobPosting"("profileId", "createdAt");
