-- Per-profile plan: "tailor" (fetch + tailor, the existing behaviour) or
-- "normal" (fetch only; the candidate applies with one fixed resume).
--
-- Hand-written as two ALTER TABLE ADD COLUMN statements, matching the
-- admin-notice and company-blacklist migrations: SQLite adds columns in place,
-- so neither table is redefined and existing rows are untouched.
--
-- Both default to 'tailor', so every existing client and profile keeps working
-- exactly as before and this migration is behaviour-neutral on deploy.
ALTER TABLE "Profile" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'tailor';
ALTER TABLE "Client" ADD COLUMN "defaultPlan" TEXT NOT NULL DEFAULT 'tailor';
