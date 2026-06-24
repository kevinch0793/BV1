-- Add LLM-classified workplace mode (remote | hybrid | in-person | onsite).
ALTER TABLE "JobPosting" ADD COLUMN "workplace" TEXT;
