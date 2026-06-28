-- Configurable Skills-section size (category count + items per category).
ALTER TABLE "Settings" ADD COLUMN "skillsMinCategories" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Settings" ADD COLUMN "skillsMaxCategories" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "Settings" ADD COLUMN "skillsMinItems" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "Settings" ADD COLUMN "skillsMaxItems" INTEGER NOT NULL DEFAULT 9;
