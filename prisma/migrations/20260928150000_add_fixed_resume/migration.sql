-- The one fixed resume a "normal"-plan candidate attaches to every application.
--
-- Stored as a BLOB in the database rather than a file on the volume, so the
-- nightly SQLite backup covers it; a file on disk would sit outside every
-- backup we take.
--
-- A new table, so nothing existing is touched. The UNIQUE on profileId enforces
-- one resume per profile (re-uploading replaces it), and the FK cascade means a
-- deleted profile takes its resume with it.
CREATE TABLE IF NOT EXISTS "FixedResume" (
    "id"        TEXT PRIMARY KEY NOT NULL,
    "profileId" TEXT NOT NULL UNIQUE,
    "filename"  TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "bytes"     BLOB NOT NULL,
    "size"      INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FixedResume_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
