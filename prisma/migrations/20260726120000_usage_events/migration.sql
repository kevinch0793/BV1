-- Per-LLM-call usage (tokens + latency) for the admin analytics dashboard.
-- Plain string ids (no FKs) so usage history survives profile/job pruning.
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "profileId" TEXT,
    "jobId" TEXT,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "UsageEvent_clientId_createdAt_idx" ON "UsageEvent"("clientId", "createdAt");
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");
