-- Global default resume template (chosen in Settings).
ALTER TABLE "Settings" ADD COLUMN "defaultTemplate" TEXT NOT NULL DEFAULT 'modern';
