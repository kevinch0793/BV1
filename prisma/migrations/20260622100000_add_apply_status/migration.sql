-- Manual application status: none | applied | not_available.
ALTER TABLE "JobPosting" ADD COLUMN "applyStatus" TEXT NOT NULL DEFAULT 'none';
UPDATE "JobPosting" SET "applyStatus" = 'applied' WHERE "appliedAt" IS NOT NULL;
