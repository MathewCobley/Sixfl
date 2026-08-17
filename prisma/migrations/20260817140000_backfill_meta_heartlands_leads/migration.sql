-- Backfill Meta leads imported from the Heartlands campaign before the
-- CSV importer started assigning a prospective league automatically.
-- This is intentionally limited to unassigned Meta leads whose stored
-- campaign metadata explicitly identifies Heartlands.
UPDATE "InterestLead" AS lead
SET
  "leagueId" = heartlands."id",
  "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT "id"
  FROM "League"
  WHERE "slug" = 'heartlands'
    AND "isActive" = true
  ORDER BY "createdAt" DESC
  LIMIT 1
) AS heartlands
WHERE lead."leagueId" IS NULL
  AND COALESCE(lead."source", '') ILIKE 'Meta - %'
  AND COALESCE(lead."message", '') ILIKE '%Campaign:%Heartlands%';
