-- Claude model used for tailoring (chosen in Settings).
ALTER TABLE "Settings" ADD COLUMN "tailoringModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';
