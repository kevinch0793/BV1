-- Track application status per job.
ALTER TABLE "JobPosting" ADD COLUMN "appliedAt" DATETIME;
ALTER TABLE "JobPosting" ADD COLUMN "appliedTailored" BOOLEAN;
