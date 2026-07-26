-- Move resume template style (template + font + accent) to be per-profile.
-- Backfill each existing profile from its client's Settings so appearance is
-- preserved (the client-wide Settings columns are left in place, now unused).
ALTER TABLE "Profile" ADD COLUMN "resumeFont" TEXT;
ALTER TABLE "Profile" ADD COLUMN "resumeAccent" TEXT;

UPDATE "Profile" SET "resumeFont" = (SELECT "resumeFont" FROM "Settings" WHERE "Settings"."clientId" = "Profile"."clientId");
UPDATE "Profile" SET "resumeAccent" = (SELECT "resumeAccent" FROM "Settings" WHERE "Settings"."clientId" = "Profile"."clientId");
UPDATE "Profile" SET "templateId" = (SELECT "defaultTemplate" FROM "Settings" WHERE "Settings"."clientId" = "Profile"."clientId") WHERE "templateId" IS NULL;
