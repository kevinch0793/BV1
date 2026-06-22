-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TailoredResume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "jobPostingId" TEXT,
    "templateId" TEXT NOT NULL DEFAULT 'classic',
    "mode" TEXT NOT NULL,
    "instructions" TEXT,
    "content" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TailoredResume_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TailoredResume_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TailoredResume" ("content", "createdAt", "id", "instructions", "jobPostingId", "mode", "profileId", "templateId") SELECT "content", "createdAt", "id", "instructions", "jobPostingId", "mode", "profileId", "templateId" FROM "TailoredResume";
DROP TABLE "TailoredResume";
ALTER TABLE "new_TailoredResume" RENAME TO "TailoredResume";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
