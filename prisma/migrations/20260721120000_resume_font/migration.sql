-- Resume font family + proportional size scale (Settings → Template).
ALTER TABLE "Settings" ADD COLUMN "resumeFont" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "Settings" ADD COLUMN "resumeFontScale" INTEGER NOT NULL DEFAULT 100;
