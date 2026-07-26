-- Per-client resume accent color (Settings → Template). Additive; the deprecated
-- resumeFontScale column is left in place (unused) to avoid a destructive change.
ALTER TABLE "Settings" ADD COLUMN "resumeAccent" TEXT NOT NULL DEFAULT 'default';
