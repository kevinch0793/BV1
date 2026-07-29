-- CreateTable: app-wide singleton config (admin-set global tailoring model).
-- NOTE: Prisma also proposed redefining Profile/Settings to make `clientId`
-- NOT NULL (a pre-existing schema-vs-db drift, unrelated to this feature). That
-- destructive RedefineTables step was intentionally removed so this migration is
-- purely additive; the drift is left exactly as it was before.
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "tailoringModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "updatedAt" DATETIME NOT NULL
);
