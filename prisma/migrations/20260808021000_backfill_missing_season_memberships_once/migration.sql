-- One-time compatibility backfill before LeagueSeasonTeam becomes the sole
-- source of truth for current season participation and division placement.
--
-- Important safety rules:
-- - only create a row when no LeagueSeasonTeam row exists at all for the pair;
-- - never reactivate or overwrite an explicit inactive season membership;
-- - only copy a division when it is active and belongs to the same league;
-- - never add fixture-placeholder/TBC teams through this legacy backfill.

INSERT INTO "LeagueSeasonTeam" (
  "id",
  "leagueId",
  "teamId",
  "divisionId",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'lst_' || md5(t."id" || ':' || t."leagueId"),
  t."leagueId",
  t."id",
  CASE
    WHEN d."id" IS NOT NULL THEN d."id"
    ELSE NULL
  END,
  true,
  NOW(),
  NOW()
FROM "Team" t
LEFT JOIN "LeagueDivision" d
  ON d."id" = t."divisionId"
 AND d."leagueId" = t."leagueId"
 AND d."isActive" = true
WHERE t."leagueId" IS NOT NULL
  AND COALESCE(t."isFixturePlaceholder", false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM "LeagueSeasonTeam" existing
    WHERE existing."leagueId" = t."leagueId"
      AND existing."teamId" = t."id"
  )
ON CONFLICT ("leagueId", "teamId") DO NOTHING;
