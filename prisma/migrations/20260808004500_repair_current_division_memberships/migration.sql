-- Recover current-season division membership from fixture evidence without
-- guessing. LeagueSeasonTeam remains the authoritative season membership.
--
-- 1) If an ACTIVE season membership has lost its division, restore it only when
--    all valid division-tagged fixtures for that team in that league point to
--    exactly one active division.
-- 2) If a team has a FUTURE SCHEDULED fixture in a valid division, that team
--    must still participate in that season. Restore/reactivate the season row
--    only when all of its future scheduled fixture evidence points to one
--    division.
-- 3) Refill the legacy Team.divisionId compatibility field only where the team
--    has exactly one active season division. This keeps older admin screens from
--    falsely showing zero teams while they are migrated to LeagueSeasonTeam.

WITH fixture_division_evidence AS (
  SELECT
    f."leagueId",
    team_ids."teamId",
    MIN(f."divisionId") AS "divisionId",
    COUNT(DISTINCT f."divisionId") AS division_count
  FROM "Fixture" f
  CROSS JOIN LATERAL (
    VALUES (f."homeTeamId"), (f."awayTeamId")
  ) AS team_ids("teamId")
  JOIN "LeagueDivision" d
    ON d."id" = f."divisionId"
   AND d."leagueId" = f."leagueId"
   AND d."isActive" = TRUE
  WHERE f."divisionId" IS NOT NULL
  GROUP BY f."leagueId", team_ids."teamId"
),
unambiguous_fixture_division AS (
  SELECT "leagueId", "teamId", "divisionId"
  FROM fixture_division_evidence
  WHERE division_count = 1
)
UPDATE "LeagueSeasonTeam" lst
SET
  "divisionId" = evidence."divisionId",
  "updatedAt" = NOW()
FROM unambiguous_fixture_division evidence
WHERE lst."leagueId" = evidence."leagueId"
  AND lst."teamId" = evidence."teamId"
  AND lst."isActive" = TRUE
  AND lst."divisionId" IS NULL;

WITH future_fixture_division_evidence AS (
  SELECT
    f."leagueId",
    team_ids."teamId",
    MIN(f."divisionId") AS "divisionId",
    COUNT(DISTINCT f."divisionId") AS division_count
  FROM "Fixture" f
  CROSS JOIN LATERAL (
    VALUES (f."homeTeamId"), (f."awayTeamId")
  ) AS team_ids("teamId")
  JOIN "LeagueDivision" d
    ON d."id" = f."divisionId"
   AND d."leagueId" = f."leagueId"
   AND d."isActive" = TRUE
  WHERE f."status" = 'SCHEDULED'
    AND f."divisionId" IS NOT NULL
    AND f."kickoffAt" >= NOW()
  GROUP BY f."leagueId", team_ids."teamId"
),
unambiguous_future_membership AS (
  SELECT "leagueId", "teamId", "divisionId"
  FROM future_fixture_division_evidence
  WHERE division_count = 1
)
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
  'lst_' || md5(evidence."teamId" || ':' || evidence."leagueId"),
  evidence."leagueId",
  evidence."teamId",
  evidence."divisionId",
  TRUE,
  NOW(),
  NOW()
FROM unambiguous_future_membership evidence
ON CONFLICT ("leagueId", "teamId") DO UPDATE
SET
  "isActive" = TRUE,
  "divisionId" = COALESCE("LeagueSeasonTeam"."divisionId", EXCLUDED."divisionId"),
  "updatedAt" = NOW();

WITH unique_active_division AS (
  SELECT
    lst."teamId",
    MIN(lst."divisionId") AS "divisionId",
    COUNT(DISTINCT lst."divisionId") AS division_count
  FROM "LeagueSeasonTeam" lst
  JOIN "LeagueDivision" d
    ON d."id" = lst."divisionId"
   AND d."leagueId" = lst."leagueId"
   AND d."isActive" = TRUE
  WHERE lst."isActive" = TRUE
    AND lst."divisionId" IS NOT NULL
  GROUP BY lst."teamId"
)
UPDATE "Team" t
SET
  "divisionId" = active."divisionId",
  "updatedAt" = NOW()
FROM unique_active_division active
WHERE t."id" = active."teamId"
  AND active.division_count = 1
  AND t."divisionId" IS DISTINCT FROM active."divisionId";
