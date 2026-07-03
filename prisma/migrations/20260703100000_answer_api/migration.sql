-- Application-answer API: per-client token (hashed) + the profile it answers as.
ALTER TABLE "Settings" ADD COLUMN "apiTokenHash" TEXT;
ALTER TABLE "Settings" ADD COLUMN "answerProfileId" TEXT;
CREATE UNIQUE INDEX "Settings_apiTokenHash_key" ON "Settings"("apiTokenHash");
