-- Admin pause switch per profile: when true, the fetch+tailor pipeline is stopped
-- for this profile and adding URLs / paste-JD / refetch are blocked.
-- Purely additive. (As with 20260729011424_add_app_config, Prisma would also try to
-- redefine Profile/Settings for the pre-existing clientId nullable->required drift;
-- that destructive RedefineTables step is intentionally omitted.)
ALTER TABLE "Profile" ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT false;
