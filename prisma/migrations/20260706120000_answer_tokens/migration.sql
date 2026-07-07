-- Per-profile application-answer tokens: one client can have several tokens, each
-- bound to a candidate profile, replacing the single Settings.apiTokenHash +
-- answerProfileId. Lets two candidates use the extension at the same time without
-- one token overwriting the other.
CREATE TABLE "AnswerToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" DATETIME,
  CONSTRAINT "AnswerToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnswerToken_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AnswerToken_tokenHash_key" ON "AnswerToken"("tokenHash");
CREATE INDEX "AnswerToken_clientId_idx" ON "AnswerToken"("clientId");

-- Preserve any currently-active token so nothing breaks mid-use.
INSERT INTO "AnswerToken" ("id", "clientId", "profileId", "tokenHash", "createdAt")
SELECT lower(hex(randomblob(16))), "clientId", "answerProfileId", "apiTokenHash", CURRENT_TIMESTAMP
FROM "Settings"
WHERE "apiTokenHash" IS NOT NULL AND "answerProfileId" IS NOT NULL;

-- Drop the old single-token storage on Settings (index first, it references the column).
DROP INDEX IF EXISTS "Settings_apiTokenHash_key";
ALTER TABLE "Settings" DROP COLUMN "apiTokenHash";
ALTER TABLE "Settings" DROP COLUMN "answerProfileId";
