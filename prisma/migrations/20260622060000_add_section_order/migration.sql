-- Full resume section render order (drag-and-drop in Settings).
ALTER TABLE "Settings" ADD COLUMN "sectionOrder" TEXT NOT NULL DEFAULT 'summary,experience,skills,education';
