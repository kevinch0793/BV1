-- Admin-switchable OpenAI keys. IF NOT EXISTS because this deployment applies
-- schema changes by hand and `migrate deploy` may replay the file afterwards.
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "last6" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "lastStatus" TEXT,
    "lastDetail" TEXT,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ApiKey_active_idx" ON "ApiKey"("active");
