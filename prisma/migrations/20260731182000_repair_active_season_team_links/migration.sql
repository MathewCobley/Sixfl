-- Keep the legacy Team.leagueId aligned with the one active season membership
-- where a team has exactly one active LeagueSeasonTeam row. This repairs teams
-- carried forward from an older seasonal league record without changing teams
-- that are explicitly set to No league.
WITH single_active_membership AS (
  SELECT
    lst."teamId",
    MIN(lst."leagueId") AS "leagueId"
  FROM "LeagueSeasonTeam" lst
  WHERE lst."isActive" = true
  GROUP BY lst."teamId"
  HAVING COUNT(*) = 1
)
UPDATE "Team" t
SET
  "leagueId" = sam."leagueId",
  "updatedAt" = NOW()
FROM single_active_membership sam
WHERE t."id" = sam."teamId"
  AND t."leagueId" IS NOT NULL
  AND t."leagueId" <> sam."leagueId"
  AND COALESCE(t."isFixturePlaceholder", false) = false;

-- Six Offenders was explicitly removed from its league. Remove the stale
-- active season row so it cannot appear in standings or missing-fixture checks.
UPDATE "LeagueSeasonTeam" lst
SET
  "isActive" = false,
  "updatedAt" = NOW()
FROM "Team" t
WHERE lst."teamId" = t."id"
  AND lst."isActive" = true
  AND t."leagueId" IS NULL
  AND LOWER(TRIM(t."name")) = 'six offenders';
