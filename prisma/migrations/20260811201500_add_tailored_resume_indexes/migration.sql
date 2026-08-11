-- Prisma does not create indexes for foreign keys on SQLite, so TailoredResume
-- had none. The pipeline's queue query (fetched jobs with no tailored resume)
-- is a NOT EXISTS on jobPostingId, which the planner executed as a full scan of
-- this table for every candidate job: 8.7s to return zero rows at 16k rows, on
-- every round of the loop and at every startup resume. The cascade delete that
-- retention triggers when pruning jobs scanned for the same reason.
--
-- IF NOT EXISTS: these were also created directly against the running database,
-- so this migration is a no-op there and applies normally on a fresh volume.
CREATE INDEX IF NOT EXISTS "TailoredResume_jobPostingId_idx" ON "TailoredResume"("jobPostingId");
CREATE INDEX IF NOT EXISTS "TailoredResume_profileId_idx" ON "TailoredResume"("profileId");
