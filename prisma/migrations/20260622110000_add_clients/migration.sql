-- Multi-tenant clients. Columns are added nullable here and backfilled by the
-- seed (prisma/seed.ts) which also creates the admin; the Prisma schema marks
-- Profile.clientId / Settings.clientId as required since every row is populated.

CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'client',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME
);
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

ALTER TABLE "Profile" ADD COLUMN "clientId" TEXT REFERENCES "Client"("id") ON DELETE CASCADE;

ALTER TABLE "Settings" ADD COLUMN "clientId" TEXT REFERENCES "Client"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "Settings_clientId_key" ON "Settings"("clientId");
