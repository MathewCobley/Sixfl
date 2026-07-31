-- Restore SWAZ to the active Summer 2026 Championship membership.
-- LeagueSeasonTeam is the authoritative source for current-season tables.

DO $$
DECLARE
  target_team_id TEXT;
  target_league_id TEXT;
  target_division_id TEXT;
  target_competition_id TEXT;
BEGIN
  SELECT
    l."id",
    l."competitionId"
  INTO
    target_league_id,
    target_competition_id
  FROM "League" l
  INNER JOIN "LeagueDivision" d
    ON d."leagueId" = l."id"
   AND d."isActive" = true
  LEFT JOIN "LeagueCompetition" c
    ON c."id" = l."competitionId"
  WHERE LOWER(TRIM(d."name")) = 'championship'
    AND LOWER(TRIM(COALESCE(l."season", ''))) = 'summer 2026'
    AND (
      LOWER(COALESCE(c."name", '')) LIKE '%harrogate%west%tuesday%rossett%'
      OR LOWER(COALESCE(l."name", '')) LIKE '%harrogate%west%tuesday%rossett%'
      OR LOWER(COALESCE(l."venueName", '')) LIKE '%rossett%'
    )
  ORDER BY
    CASE WHEN c."currentLeagueId" = l."id" THEN 0 ELSE 1 END,
    l."isActive" DESC,
    l."updatedAt" DESC
  LIMIT 1;

  IF target_league_id IS NULL THEN
    RAISE EXCEPTION 'Could not find the Summer 2026 Harrogate West Tuesday Rossett league.';
  END IF;

  SELECT t."id"
  INTO target_team_id
  FROM "Team" t
  LEFT JOIN "League" existing_league
    ON existing_league."id" = t."leagueId"
  WHERE UPPER(TRIM(t."name")) = 'SWAZ'
    AND COALESCE(t."isFixturePlaceholder", false) = false
    AND (
      t."leagueId" = target_league_id
      OR t."competitionId" = target_competition_id
      OR existing_league."competitionId" = target_competition_id
      OR (t."competitionId" IS NULL AND existing_league."competitionId" IS NULL)
    )
  ORDER BY
    CASE WHEN t."leagueId" = target_league_id THEN 0 ELSE 1 END,
    t."updatedAt" DESC
  LIMIT 1;

  IF target_team_id IS NULL THEN
    RAISE EXCEPTION 'Could not find the SWAZ team record.';
  END IF;

  SELECT d."id"
  INTO target_division_id
  FROM "LeagueDivision" d
  WHERE d."leagueId" = target_league_id
    AND d."isActive" = true
    AND LOWER(TRIM(d."name")) = 'championship'
  ORDER BY d."sortOrder" ASC, d."updatedAt" DESC
  LIMIT 1;

  IF target_division_id IS NULL THEN
    RAISE EXCEPTION 'Could not find the Championship division.';
  END IF;

  -- A team should have one active current-season membership. Remove any stale
  -- active row before restoring the correct league and division.
  UPDATE "LeagueSeasonTeam"
  SET
    "isActive" = false,
    "divisionId" = NULL,
    "updatedAt" = NOW()
  WHERE "teamId" = target_team_id
    AND "leagueId" <> target_league_id
    AND "isActive" = true;

  INSERT INTO "LeagueSeasonTeam" (
    "id",
    "leagueId",
    "teamId",
    "divisionId",
    "isActive",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    'lst_swaz_' || MD5(target_team_id || ':' || target_league_id),
    target_league_id,
    target_team_id,
    target_division_id,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT ("leagueId", "teamId") DO UPDATE
  SET
    "divisionId" = EXCLUDED."divisionId",
    "isActive" = true,
    "updatedAt" = NOW();

  -- Keep the legacy fields aligned for older admin screens, while current
  -- standings continue to use LeagueSeasonTeam as their source of truth.
  UPDATE "Team"
  SET
    "leagueId" = target_league_id,
    "competitionId" = COALESCE(target_competition_id, "competitionId"),
    "divisionId" = target_division_id,
    "updatedAt" = NOW()
  WHERE "id" = target_team_id;
END $$;
