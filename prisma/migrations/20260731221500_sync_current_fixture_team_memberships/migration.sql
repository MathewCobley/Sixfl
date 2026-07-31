-- Keep current-season league membership aligned with the fixtures that are
-- actually being played. A real team used in a fixture for the active/current
-- league must appear in that season and division's table.

CREATE OR REPLACE FUNCTION "sync_fixture_season_memberships"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "League" l
    LEFT JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
    WHERE l."id" = NEW."leagueId"
      AND (l."isActive" = TRUE OR c."currentLeagueId" = l."id")
  ) THEN
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
      'lst_fixture_' || MD5(NEW."leagueId" || ':' || team."id"),
      NEW."leagueId",
      team."id",
      NEW."divisionId",
      TRUE,
      NOW(),
      NOW()
    FROM "Team" team
    WHERE team."id" IN (NEW."homeTeamId", NEW."awayTeamId")
      AND COALESCE(team."isFixturePlaceholder", FALSE) = FALSE
      AND UPPER(TRIM(team."name")) <> 'TBC'
    ON CONFLICT ("leagueId", "teamId") DO UPDATE
    SET
      "divisionId" = COALESCE(EXCLUDED."divisionId", "LeagueSeasonTeam"."divisionId"),
      "isActive" = TRUE,
      "updatedAt" = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Fixture_sync_season_memberships" ON "Fixture";

CREATE TRIGGER "Fixture_sync_season_memberships"
AFTER INSERT OR UPDATE OF "leagueId", "divisionId", "homeTeamId", "awayTeamId"
ON "Fixture"
FOR EACH ROW
EXECUTE FUNCTION "sync_fixture_season_memberships"();

-- Backfill all real teams already used in fixtures belonging to a current or
-- active league. This repairs SWAZ and any other team omitted from the season
-- membership records without relying on a team-name guess.
WITH current_fixture_teams AS (
  SELECT
    f."leagueId",
    f."divisionId",
    f."homeTeamId" AS "teamId"
  FROM "Fixture" f
  INNER JOIN "League" l ON l."id" = f."leagueId"
  LEFT JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
  WHERE l."isActive" = TRUE OR c."currentLeagueId" = l."id"

  UNION

  SELECT
    f."leagueId",
    f."divisionId",
    f."awayTeamId" AS "teamId"
  FROM "Fixture" f
  INNER JOIN "League" l ON l."id" = f."leagueId"
  LEFT JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
  WHERE l."isActive" = TRUE OR c."currentLeagueId" = l."id"
),
eligible_fixture_teams AS (
  SELECT DISTINCT
    fixture_team."leagueId",
    fixture_team."divisionId",
    fixture_team."teamId"
  FROM current_fixture_teams fixture_team
  INNER JOIN "Team" team ON team."id" = fixture_team."teamId"
  WHERE COALESCE(team."isFixturePlaceholder", FALSE) = FALSE
    AND UPPER(TRIM(team."name")) <> 'TBC'
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
  'lst_fixture_backfill_' || MD5(team."leagueId" || ':' || team."teamId"),
  team."leagueId",
  team."teamId",
  team."divisionId",
  TRUE,
  NOW(),
  NOW()
FROM eligible_fixture_teams team
ON CONFLICT ("leagueId", "teamId") DO UPDATE
SET
  "divisionId" = COALESCE(EXCLUDED."divisionId", "LeagueSeasonTeam"."divisionId"),
  "isActive" = TRUE,
  "updatedAt" = NOW();

-- Also restore a SWAZ-labelled record to the Championship containing the five
-- teams currently visible in the screenshot. This covers the case where SWAZ
-- has not yet been placed into a fixture in the current season.
WITH target_championship AS (
  SELECT
    lst."leagueId",
    lst."divisionId",
    COUNT(*) AS "knownTeamCount"
  FROM "LeagueSeasonTeam" lst
  INNER JOIN "LeagueDivision" division
    ON division."id" = lst."divisionId"
   AND division."leagueId" = lst."leagueId"
  INNER JOIN "Team" team ON team."id" = lst."teamId"
  INNER JOIN "League" league ON league."id" = lst."leagueId"
  LEFT JOIN "LeagueCompetition" competition
    ON competition."id" = league."competitionId"
  WHERE lst."isActive" = TRUE
    AND division."isActive" = TRUE
    AND LOWER(TRIM(division."name")) = 'championship'
    AND (league."isActive" = TRUE OR competition."currentLeagueId" = league."id")
    AND REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g') IN (
      'wetherbywanderers',
      'rossettvets',
      'dynamokebab',
      'thefatbstrdsfc',
      'thefatbastardsfc',
      'wenlockwarriors'
    )
  GROUP BY lst."leagueId", lst."divisionId"
  HAVING COUNT(*) >= 3
  ORDER BY COUNT(*) DESC
  LIMIT 1
),
swaz_candidate AS (
  SELECT team."id" AS "teamId"
  FROM "Team" team
  CROSS JOIN target_championship target
  LEFT JOIN "Fixture" fixture
    ON fixture."leagueId" = target."leagueId"
   AND fixture."divisionId" = target."divisionId"
   AND team."id" IN (fixture."homeTeamId", fixture."awayTeamId")
  LEFT JOIN "LeagueSeasonTeam" membership
    ON membership."leagueId" = target."leagueId"
   AND membership."teamId" = team."id"
  WHERE COALESCE(team."isFixturePlaceholder", FALSE) = FALSE
    AND REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g') LIKE '%swaz%'
  ORDER BY
    CASE WHEN fixture."id" IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN membership."id" IS NOT NULL THEN 0 ELSE 1 END,
    team."updatedAt" DESC
  LIMIT 1
),
restored_swaz AS (
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
    'lst_swaz_final_' || MD5(candidate."teamId" || ':' || target."leagueId"),
    target."leagueId",
    candidate."teamId",
    target."divisionId",
    TRUE,
    NOW(),
    NOW()
  FROM swaz_candidate candidate
  CROSS JOIN target_championship target
  ON CONFLICT ("leagueId", "teamId") DO UPDATE
  SET
    "divisionId" = EXCLUDED."divisionId",
    "isActive" = TRUE,
    "updatedAt" = NOW()
  RETURNING "teamId", "leagueId", "divisionId"
)
UPDATE "Team" team
SET
  "leagueId" = restored."leagueId",
  "divisionId" = restored."divisionId",
  "updatedAt" = NOW()
FROM restored_swaz restored
WHERE team."id" = restored."teamId";
