-- Where the Skills section renders relative to Work Experience.
ALTER TABLE "Settings" ADD COLUMN "skillsPosition" TEXT NOT NULL DEFAULT 'after';
