-- Reserved templates (bold/tech/violet/slate) are exclusive to anustariq45. The
-- earlier per-client backfill left some non-exempt profiles on a reserved template
-- (their old client default). Coerce those to the closest non-reserved template so
-- reserved templates only ever appear on the exempt account's profiles.
UPDATE "Profile" SET "templateId" = CASE "templateId"
  WHEN 'bold' THEN 'ink'
  WHEN 'tech' THEN 'terminal'
  WHEN 'violet' THEN 'modern'
  WHEN 'slate' THEN 'minimal'
  ELSE "templateId"
END
WHERE "templateId" IN ('bold', 'tech', 'violet', 'slate')
  AND "clientId" NOT IN (SELECT "id" FROM "Client" WHERE lower("email") = 'anustariq45@gmail.com');
