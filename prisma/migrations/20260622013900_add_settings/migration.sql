-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "customInstructions" TEXT,
    "updatedAt" DATETIME NOT NULL
);
