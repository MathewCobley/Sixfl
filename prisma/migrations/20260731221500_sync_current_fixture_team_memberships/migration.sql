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
-- active league. Rank the fixture rows first so every league/team combination
-- appears exactly once in the INSERT. PostgreSQL rejects an ON CONFLICT update
-- when the same target row occurs twice in one statement.
WITH fixture_team_candidates AS (
  SELECT
    f."leagueId",
    f."divisionId",
    f."homeTeamId" AS "teamId",
    f."kickoffAt",
    f."updatedAt"
  FROM "Fixture" f
  INNER JOIN "League" l ON l."id" = f."leagueId"
  LEFT JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
  WHERE l."isActive" = TRUE OR c."currentLeagueId" = l."id"

  UNION ALL

  SELECT
    f."leagueId",
    f."divisionId",
    f."awayTeamId" AS "teamId",
    f."kickoffAt",
    f."updatedAt"
  FROM "Fixture" f
  INNER JOIN "League" l ON l."id" = f."leagueId"
  LEFT JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
  WHERE l."isActive" = TRUE OR c."currentLeagueId" = l."id"
),
ranked_fixture_teams AS (
  SELECT
    candidate."leagueId",
    candidate."divisionId",
    candidate."teamId",
    ROW_NUMBER() OVER (
      PARTITION BY candidate."leagueId", candidate."teamId"
      ORDER BY
        candidate."kickoffAt" DESC,
        candidate."updatedAt" DESC,
        candidate."divisionId" NULLS LAST
    ) AS "rowNumber"
  FROM fixture_team_candidates candidate
  INNER JOIN "Team" team ON team."id" = candidate."teamId"
  WHERE COALESCE(team."isFixturePlaceholder", FALSE) = FALSE
    AND UPPER(TRIM(team."name")) <> 'TBC'
),
eligible_fixture_teams AS (
  SELECT
    ranked."leagueId",
    ranked."divisionId",
    ranked."teamId"
  FROM ranked_fixture_teams ranked
  WHERE ranked."rowNumber" = 1
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

-- Restore a SWAZ-labelled record to the Championship containing the teams that
-- identify the affected table. This is a safe no-op when no matching record is
-- found, and covers SWAZ even when it has no current fixture yet.
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
  LEFT JOIN "LeagueSeasonTeam" membership
    ON membership."leagueId" = target."leagueId"
   AND membership."teamId" = team."id"
  WHERE COALESCE(team."isFixturePlaceholder", FALSE) = FALSE
    AND REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g') LIKE '%swaz%'
  ORDER BY
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