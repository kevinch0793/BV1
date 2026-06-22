-- Projects now live as JSON subgroups on Experience. Drop the standalone table
-- and the deprecated Experience.bullets column.
PRAGMA foreign_keys=OFF;
DROP TABLE "Project";
ALTER TABLE "Experience" DROP COLUMN "bullets";
PRAGMA foreign_keys=ON;
