-- The "Template default" font/accent option was removed. Pin every profile that
-- was on 'default' (or unset) to the concrete font + accent closest to its
-- template, so résumés keep ~the same look with an explicit style.
UPDATE "Profile" SET "resumeFont" = CASE
  WHEN "templateId" IN ('elegant', 'rose', 'stone', 'classic') THEN 'georgia'
  WHEN "templateId" = 'terminal' THEN 'mono'
  ELSE 'sans'
END
WHERE "resumeFont" IS NULL OR "resumeFont" = 'default';

UPDATE "Profile" SET "resumeAccent" = CASE "templateId"
  WHEN 'modern' THEN 'sky'
  WHEN 'tech' THEN 'teal'
  WHEN 'navy' THEN 'navy'
  WHEN 'emerald' THEN 'emerald'
  WHEN 'rose' THEN 'rose'
  WHEN 'amber' THEN 'amber'
  WHEN 'violet' THEN 'violet'
  WHEN 'terminal' THEN 'emerald'
  WHEN 'bold' THEN 'black'
  WHEN 'ink' THEN 'black'
  WHEN 'classic' THEN 'black'
  ELSE 'slate'
END
WHERE "resumeAccent" IS NULL OR "resumeAccent" = 'default';
