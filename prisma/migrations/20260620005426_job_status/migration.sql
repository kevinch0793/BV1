-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JobPosting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "url" TEXT,
    "company" TEXT,
    "role" TEXT,
    "location" TEXT,
    "descriptionRaw" TEXT,
    "descriptionParsed" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobPosting_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JobPosting" ("company", "createdAt", "descriptionParsed", "descriptionRaw", "id", "location", "profileId", "role", "status", "url") SELECT "company", "createdAt", "descriptionParsed", "descriptionRaw", "id", "location", "profileId", "role", "status", "url" FROM "JobPosting";
DROP TABLE "JobPosting";
ALTER TABLE "new_JobPosting" RENAME TO "JobPosting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
