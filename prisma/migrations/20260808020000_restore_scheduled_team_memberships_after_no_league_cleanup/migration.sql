-- A team with a future SCHEDULED fixture is an active participant in that
-- fixture's season. Earlier no-league cleanup migrations could incorrectly
-- deactivate such LeagueSeasonTeam rows (and clear their divisions) when the
-- legacy Team.leagueId field was NULL.
--
-- Recover only from unambiguous future fixture evidence:
--   * exactly one future league for the team; and
--   * a division only when all future division-tagged fixtures agree.
-- This intentionally does not reactivate teams that only have historical games.

WITH future_rows AS (
  SELECT f."homeTeamId" AS "teamId", f."leagueId", f."divisionId"
  FROM "Fixture" f
  WHERE f."status" = 'SCHEDULED'
    AND f."kickoffAt" >= NOW()
  UNION ALL
  SELECT f."awayTeamId" AS "teamId", f."leagueId", f."divisionId"
  FROM "Fixture" f
  WHERE f."status" = 'SCHEDULED'
    AND f."kickoffAt" >= NOW()
),
unique_future_league AS (
  SELECT
    "teamId",
    MIN("leagueId") AS "leagueId"
  FROM future_rows
  GROUP BY "teamId"
  HAVING COUNT(DISTINCT "leagueId") = 1
),
future_division_choice AS (
  SELECT
    rows."teamId",
    rows."leagueId",
    CASE
      WHEN COUNT(DISTINCT rows."divisionId") FILTER (WHERE rows."divisionId" IS NOT NULL) = 1
      THEN MIN(rows."divisionId") FILTER (WHERE rows."divisionId" IS NOT NULL)
      ELSE NULL
    END AS "divisionId"
  FROM future_rows rows
  JOIN unique_future_league unique_league
    ON unique_league."teamId" = rows."teamId"
   AND unique_league."leagueId" = rows."leagueId"
  GROUP BY rows."teamId", rows."leagueId"
)
UPDATE "Team" team
SET
  "leagueId" = choice."leagueId",
  "competitionId" = COALESCE(league."competitionId", team."competitionId"),
  "divisionId" = COALESCE(choice."divisionId", team."divisionId"),
  "updatedAt" = NOW()
FROM future_division_choice choice
JOIN "League" league ON league."id" = choice."leagueId"
WHERE team."id" = choice."teamId"
  AND (
    team."leagueId" IS DISTINCT FROM choice."leagueId"
    OR (choice."divisionId" IS NOT NULL AND team."divisionId" IS DISTINCT FROM choice."divisionId")
  );

WITH future_rows AS (
  SELECT f."homeTeamId" AS "teamId", f."leagueId", f."divisionId"
  FROM "Fixture" f
  WHERE f."status" = 'SCHEDULED'
    AND f."kickoffAt" >= NOW()
  UNION ALL
  SELECT f."awayTeamId" AS "teamId", f."leagueId", f."divisionId"
  FROM "Fixture" f
  WHERE f."status" = 'SCHEDULED'
    AND f."kickoffAt" >= NOW()
),
unique_future_league AS (
  SELECT
    "teamId",
    MIN("leagueId") AS "leagueId"
  FROM future_rows
  GROUP BY "teamId"
  HAVING COUNT(DISTINCT "leagueId") = 1
),
future_division_choice AS (
  SELECT
    rows."teamId",
    rows."leagueId",
    CASE
      WHEN COUNT(DISTINCT rows."divisionId") FILTER (WHERE rows."divisionId" IS NOT NULL) = 1
      THEN MIN(rows."divisionId") FILTER (WHERE rows."divisionId" IS NOT NULL)
      ELSE NULL
    END AS "divisionId"
  FROM future_rows rows
  JOIN unique_future_league unique_league
    ON unique_league."teamId" = rows."teamId"
   AND unique_league."leagueId" = rows."leagueId"
  GROUP BY rows."teamId", rows."leagueId"
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
  'lst_' || md5(choice."teamId" || ':' || choice."leagueId"),
  choice."leagueId",
  choice."teamId",
  choice."divisionId",
  TRUE,
  NOW(),
  NOW()
FROM future_division_choice choice
ON CONFLICT ("leagueId", "teamId") DO UPDATE
SET
  "isActive" = TRUE,
  "divisionId" = COALESCE(EXCLUDED."divisionId", "LeagueSeasonTeam"."divisionId"),
  "updatedAt" = NOW();

-- For any season row that is active again but still lacks a division, use all
-- valid fixture history only when it points to one clear division.
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
  JOIN "LeagueDivision" division
    ON division."id" = f."divisionId"
   AND division."leagueId" = f."leagueId"
   AND division."isActive" = TRUE
  WHERE f."divisionId" IS NOT NULL
  GROUP BY f."leagueId", team_ids."teamId"
)
UPDATE "LeagueSeasonTeam" lst
SET
  "divisionId" = evidence."divisionId",
  "updatedAt" = NOW()
FROM fixture_division_evidence evidence
WHERE lst."leagueId" = evidence."leagueId"
  AND lst."teamId" = evidence."teamId"
  AND lst."isActive" = TRUE
  AND lst."divisionId" IS NULL
  AND evidence.division_count = 1;

-- Keep the legacy compatibility field aligned only where the team has exactly
-- one active season division. The application now reads LeagueSeasonTeam for
-- division counts and fixture eligibility, so this is compatibility only.
WITH unique_active_division AS (
  SELECT
    lst."teamId",
    MIN(lst."divisionId") AS "divisionId",
    COUNT(DISTINCT lst."divisionId") AS division_count
  FROM "LeagueSeasonTeam" lst
  JOIN "LeagueDivision" division
    ON division."id" = lst."divisionId"
   AND division."leagueId" = lst."leagueId"
   AND division."isActive" = TRUE
  WHERE lst."isActive" = TRUE
    AND lst."divisionId" IS NOT NULL
  GROUP BY lst."teamId"
)
UPDATE "Team" team
SET
  "divisionId" = active."divisionId",
  "updatedAt" = NOW()
FROM unique_active_division active
WHERE team."id" = active."teamId"
  AND active.division_count = 1
  AND team."divisionId" IS DISTINCT FROM active."divisionId";
