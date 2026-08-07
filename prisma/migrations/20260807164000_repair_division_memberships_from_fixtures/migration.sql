-- Repair active season division memberships only where the team's fixtures in
-- that same league consistently point to exactly one valid active division.
-- This recovers memberships overwritten by the legacy Team.divisionId sync
-- without guessing for teams whose fixture history is ambiguous.

WITH team_fixture_divisions AS (
  SELECT
    lst."leagueId",
    lst."teamId",
    f."divisionId",
    COUNT(*) AS fixture_count
  FROM "LeagueSeasonTeam" lst
  JOIN "Fixture" f
    ON f."leagueId" = lst."leagueId"
   AND (f."homeTeamId" = lst."teamId" OR f."awayTeamId" = lst."teamId")
  JOIN "LeagueDivision" d
    ON d."id" = f."divisionId"
   AND d."leagueId" = lst."leagueId"
   AND d."isActive" = TRUE
  WHERE lst."isActive" = TRUE
    AND f."divisionId" IS NOT NULL
  GROUP BY lst."leagueId", lst."teamId", f."divisionId"
),
unambiguous AS (
  SELECT
    "leagueId",
    "teamId",
    MIN("divisionId") AS "divisionId"
  FROM team_fixture_divisions
  GROUP BY "leagueId", "teamId"
  HAVING COUNT(*) = 1
)
UPDATE "LeagueSeasonTeam" lst
SET
  "divisionId" = u."divisionId",
  "updatedAt" = NOW()
FROM unambiguous u
WHERE lst."leagueId" = u."leagueId"
  AND lst."teamId" = u."teamId"
  AND lst."isActive" = TRUE
  AND lst."divisionId" IS DISTINCT FROM u."divisionId";

-- Keep the legacy Team.divisionId aligned where the recovery signal is
-- unambiguous. The replacement trigger no longer copies this field back into
-- LeagueSeasonTeam, so this is compatibility only for older admin/UI code.
WITH team_fixture_divisions AS (
  SELECT
    lst."leagueId",
    lst."teamId",
    f."divisionId"
  FROM "LeagueSeasonTeam" lst
  JOIN "Fixture" f
    ON f."leagueId" = lst."leagueId"
   AND (f."homeTeamId" = lst."teamId" OR f."awayTeamId" = lst."teamId")
  JOIN "LeagueDivision" d
    ON d."id" = f."divisionId"
   AND d."leagueId" = lst."leagueId"
   AND d."isActive" = TRUE
  WHERE lst."isActive" = TRUE
    AND f."divisionId" IS NOT NULL
  GROUP BY lst."leagueId", lst."teamId", f."divisionId"
),
unambiguous AS (
  SELECT
    "leagueId",
    "teamId",
    MIN("divisionId") AS "divisionId"
  FROM team_fixture_divisions
  GROUP BY "leagueId", "teamId"
  HAVING COUNT(*) = 1
)
UPDATE "Team" t
SET
  "divisionId" = u."divisionId",
  "updatedAt" = NOW()
FROM unambiguous u
WHERE t."id" = u."teamId"
  AND t."leagueId" = u."leagueId"
  AND t."divisionId" IS DISTINCT FROM u."divisionId";
