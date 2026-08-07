-- Stabilise Harrogate Summer 2026 standings.
--
-- LeagueSeasonTeam is the authoritative source of current-season membership.
-- Fixtures must never move a team between divisions or reactivate a team that an
-- administrator removed. The old fixture trigger did exactly that, which meant
-- editing/importing historical fixtures could silently corrupt the current table.

DROP TRIGGER IF EXISTS "Fixture_sync_season_memberships" ON "Fixture";
DROP FUNCTION IF EXISTS "sync_fixture_season_memberships"();

DO $$
DECLARE
  target_league_id TEXT;
  target_competition_id TEXT;
  premiership_id TEXT;
  championship_id TEXT;
BEGIN
  SELECT
    league."id",
    league."competitionId"
  INTO
    target_league_id,
    target_competition_id
  FROM "League" league
  LEFT JOIN "LeagueCompetition" competition
    ON competition."id" = league."competitionId"
  WHERE league."slug" = 'rossett-mens-tuesday'
     OR (
       LOWER(TRIM(COALESCE(league."season", ''))) = 'summer 2026'
       AND (
         LOWER(COALESCE(league."name", '')) LIKE '%harrogate%west%tuesday%rossett%'
         OR LOWER(COALESCE(competition."name", '')) LIKE '%harrogate%west%tuesday%rossett%'
         OR LOWER(COALESCE(league."venueName", '')) LIKE '%rossett%'
       )
     )
  ORDER BY
    CASE WHEN league."slug" = 'rossett-mens-tuesday' THEN 0 ELSE 1 END,
    CASE WHEN competition."currentLeagueId" = league."id" THEN 0 ELSE 1 END,
    league."isActive" DESC,
    league."updatedAt" DESC
  LIMIT 1;

  IF target_league_id IS NULL THEN
    RAISE NOTICE 'Harrogate Summer 2026 league was not found; membership repair skipped.';
    RETURN;
  END IF;

  SELECT division."id"
  INTO premiership_id
  FROM "LeagueDivision" division
  WHERE division."leagueId" = target_league_id
    AND division."isActive" = TRUE
    AND LOWER(TRIM(division."name")) = 'premiership'
  ORDER BY division."sortOrder" ASC, division."updatedAt" DESC
  LIMIT 1;

  SELECT division."id"
  INTO championship_id
  FROM "LeagueDivision" division
  WHERE division."leagueId" = target_league_id
    AND division."isActive" = TRUE
    AND LOWER(TRIM(division."name")) = 'championship'
  ORDER BY division."sortOrder" ASC, division."updatedAt" DESC
  LIMIT 1;

  IF premiership_id IS NULL OR championship_id IS NULL THEN
    RAISE NOTICE 'Harrogate Premiership/Championship divisions were not found; membership repair skipped.';
    RETURN;
  END IF;

  -- Restore the division membership that was in place before fixture-driven
  -- membership synchronisation began moving teams between tables.
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
    'lst_harrogate_repair_' || MD5(target_league_id || ':' || team."id"),
    target_league_id,
    team."id",
    CASE
      WHEN REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g') IN (
        'riponciderboys',
        'whatastruijk',
        'roysboys',
        'reecessetpieces',
        'crescentunited'
      ) THEN premiership_id
      ELSE championship_id
    END,
    TRUE,
    NOW(),
    NOW()
  FROM "Team" team
  WHERE COALESCE(team."isFixturePlaceholder", FALSE) = FALSE
    AND team."leagueId" IS NOT NULL
    AND (
      team."leagueId" = target_league_id
      OR (
        target_competition_id IS NOT NULL
        AND team."competitionId" = target_competition_id
      )
    )
    AND REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g') IN (
      'riponciderboys',
      'whatastruijk',
      'roysboys',
      'reecessetpieces',
      'crescentunited',
      'wetherbywanderers',
      'rossettvets',
      'dynamokebab',
      'thefatbstrdsfc',
      'thefatbastardsfc',
      'wenlockwarriors',
      'swaz',
      'swazfc'
    )
  ON CONFLICT ("leagueId", "teamId") DO UPDATE
  SET
    "divisionId" = EXCLUDED."divisionId",
    "isActive" = TRUE,
    "updatedAt" = NOW();

  -- Keep legacy Team fields aligned with the authoritative season membership so
  -- older admin screens and fixture tools do not show a different division.
  UPDATE "Team" team
  SET
    "leagueId" = target_league_id,
    "competitionId" = COALESCE(target_competition_id, team."competitionId"),
    "divisionId" = CASE
      WHEN REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g') IN (
        'riponciderboys',
        'whatastruijk',
        'roysboys',
        'reecessetpieces',
        'crescentunited'
      ) THEN premiership_id
      ELSE championship_id
    END,
    "updatedAt" = NOW()
  WHERE COALESCE(team."isFixturePlaceholder", FALSE) = FALSE
    AND team."leagueId" IS NOT NULL
    AND (
      team."leagueId" = target_league_id
      OR (
        target_competition_id IS NOT NULL
        AND team."competitionId" = target_competition_id
      )
    )
    AND REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g') IN (
      'riponciderboys',
      'whatastruijk',
      'roysboys',
      'reecessetpieces',
      'crescentunited',
      'wetherbywanderers',
      'rossettvets',
      'dynamokebab',
      'thefatbstrdsfc',
      'thefatbastardsfc',
      'wenlockwarriors',
      'swaz',
      'swazfc'
    );

  -- Six Offenders was deliberately removed from the current season. Keep that
  -- removal intact even if historical fixtures still reference the team.
  UPDATE "LeagueSeasonTeam" membership
  SET
    "isActive" = FALSE,
    "divisionId" = NULL,
    "updatedAt" = NOW()
  FROM "Team" team
  WHERE membership."leagueId" = target_league_id
    AND membership."teamId" = team."id"
    AND REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g') IN (
      'sixoffenders',
      'sixoffendersfc'
    );

  UPDATE "Team" team
  SET
    "divisionId" = NULL,
    "updatedAt" = NOW()
  WHERE REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g') IN (
      'sixoffenders',
      'sixoffendersfc'
    )
    AND (
      team."leagueId" = target_league_id
      OR EXISTS (
        SELECT 1
        FROM "LeagueSeasonTeam" membership
        WHERE membership."leagueId" = target_league_id
          AND membership."teamId" = team."id"
      )
    );

  -- Repair fixture division metadata from the now-correct active membership.
  -- This does not decide membership; it only makes fixture metadata agree with
  -- the two teams when both are in the same authoritative division.
  UPDATE "Fixture" fixture
  SET
    "divisionId" = home_membership."divisionId",
    "updatedAt" = NOW()
  FROM "LeagueSeasonTeam" home_membership,
       "LeagueSeasonTeam" away_membership
  WHERE fixture."leagueId" = target_league_id
    AND home_membership."leagueId" = target_league_id
    AND away_membership."leagueId" = target_league_id
    AND home_membership."teamId" = fixture."homeTeamId"
    AND away_membership."teamId" = fixture."awayTeamId"
    AND home_membership."isActive" = TRUE
    AND away_membership."isActive" = TRUE
    AND home_membership."divisionId" IS NOT NULL
    AND home_membership."divisionId" = away_membership."divisionId"
    AND fixture."divisionId" IS DISTINCT FROM home_membership."divisionId";

  -- A saved result is proof that the match was played. Older Harrogate rows can
  -- still say SCHEDULED, which makes legacy/public result views hide the result.
  UPDATE "Fixture" fixture
  SET
    "status" = 'COMPLETED'::"FixtureStatus",
    "updatedAt" = NOW()
  WHERE fixture."leagueId" = target_league_id
    AND fixture."status" = 'SCHEDULED'::"FixtureStatus"
    AND EXISTS (
      SELECT 1
      FROM "MatchResult" result
      WHERE result."fixtureId" = fixture."id"
    );
END $$;
