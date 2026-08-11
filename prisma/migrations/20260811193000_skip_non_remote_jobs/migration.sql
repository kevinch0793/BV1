-- Only fully-remote roles are tailored (see shouldTailorWorkplace in lib/location.ts).
-- Retire the backlog that predates the rule: jobs already fetched, classified as
-- non-remote, and not yet tailored would otherwise be picked up by the queue and
-- tailored on the next run.
--
-- Deliberately narrow:
--   - status = 'fetched' only. 'needs_jd' still awaits a pasted JD (no reliable
--     classification yet), 'failed' and 'pending' have not been classified at all.
--   - an unclassified workplace (NULL or empty) is left alone, matching the code:
--     absent evidence a role is non-remote, it is still tailored.
--   - rows that already have a tailored resume keep their status; the spend is
--     already incurred and rewriting them would misreport what happened.
--
-- 'status' is a plain TEXT column, so the new value needs no schema change.
UPDATE "JobPosting"
SET "status" = 'skipped'
WHERE "status" = 'fetched'
  AND lower(trim(coalesce("workplace", ''))) IN ('hybrid', 'in-person', 'onsite')
  AND NOT EXISTS (
    SELECT 1 FROM "TailoredResume" t WHERE t."jobPostingId" = "JobPosting"."id"
  );
