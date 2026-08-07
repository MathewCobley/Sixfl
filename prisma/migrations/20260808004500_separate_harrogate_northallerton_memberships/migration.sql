-- Repair Harrogate/Northallerton competition and season membership contamination.
--
-- A July SWAZ repair selected a team by name before it had proved that the team
-- belonged to the Harrogate competition. In an ungrouped-data state that could
-- select the Northallerton SWAZ record, create a Harrogate LeagueSeasonTeam row
-- for it and move its legacy Team fields. The team was later put back into
-- Northallerton, but the stale Harrogate season row could remain active.
--
-- This migration also separates the Harrogate and Northallerton parent
-- competitions if those current league records accidentally share one. That is
-- important because the admin "Affiliated teams" list is competition-based; a
-- shared competition makes every Northallerton team look affiliated to Harrogate.

DO $$
DECLARE
  harrogate_league_id TEXT;
  harrogate_competition_id TEXT;
  northallerton_league_id TEXT;
  northallerton_competition_id TEXT;
  generated_id TEXT;
BEGIN
  SELECT l."id", l."competitionId"
  INTO harrogate_league_id, harrogate_competition_id
  FROM "League" l
  WHERE LOWER(TRIM(COALESCE(l."season", ''))) = 'summer 2026'
    AND (
      LOWER(COALESCE(l."name", '')) LIKE '%harrogate%'
      OR LOWER(COALESCE(l."area", '')) LIKE '%harrogate%'
      OR LOWER(COALESCE(l."venueName", '')) LIKE '%rossett%'
    )
  ORDER BY
    l."isActive" DESC,
    CASE WHEN LOWER(COALESCE(l."venueName", '')) LIKE '%rossett%' THEN 0 ELSE 1 END,
    l."updatedAt" DESC
  LIMIT 1;

  SELECT l."id", l."competitionId"
  INTO northallerton_league_id, northallerton_competition_id
  FROM "League" l
  WHERE LOWER(TRIM(COALESCE(l."season", ''))) = 'summer 2026'
    AND (
      LOWER(COALESCE(l."name", '')) LIKE '%northallerton%'
      OR LOWER(COALESCE(l."area", '')) LIKE '%northallerton%'
      OR LOWER(COALESCE(l."venueName", '')) LIKE '%northallerton%'
    )
  ORDER BY l."isActive" DESC, l."updatedAt" DESC
  LIMIT 1;

  IF harrogate_league_id IS NULL OR northallerton_league_id IS NULL THEN
    RAISE NOTICE 'Harrogate/Northallerton Summer 2026 pair not found; repair skipped.';
    RETURN;
  END IF;

  -- Ensure Harrogate has its own parent competition when it has none or is
  -- sharing the Northallerton parent by mistake.
  IF harrogate_competition_id IS NULL
     OR harrogate_competition_id IS NOT DISTINCT FROM northallerton_competition_id THEN
    generated_id := 'competition_harrogate_rossett_' || MD5(harrogate_league_id);

    INSERT INTO "LeagueCompetition" (
      "id", "name", "slug", "area", "dayOfWeek", "leagueType", "venueName",
      "isActive", "currentLeagueId", "createdAt", "updatedAt"
    )
    SELECT
      generated_id,
      l."name",
      'harrogate-west-tuesday-rossett-' || SUBSTRING(MD5(harrogate_league_id) FROM 1 FOR 8),
      l."area",
      l."dayOfWeek",
      l."leagueType",
      l."venueName",
      TRUE,
      harrogate_league_id,
      NOW(),
      NOW()
    FROM "League" l
    WHERE l."id" = harrogate_league_id
    ON CONFLICT ("id") DO UPDATE
    SET "currentLeagueId" = EXCLUDED."currentLeagueId",
        "updatedAt" = NOW();

    harrogate_competition_id := generated_id;
  END IF;

  -- Ensure Northallerton also has its own parent competition. If the old shared
  -- parent belonged to Northallerton we can retain it; otherwise create one.
  IF northallerton_competition_id IS NULL
     OR northallerton_competition_id = harrogate_competition_id THEN
    generated_id := 'competition_northallerton_wed_' || MD5(northallerton_league_id);

    INSERT INTO "LeagueCompetition" (
      "id", "name", "slug", "area", "dayOfWeek", "leagueType", "venueName",
      "isActive", "currentLeagueId", "createdAt", "updatedAt"
    )
    SELECT
      generated_id,
      l."name",
      'northallerton-wednesday-' || SUBSTRING(MD5(northallerton_league_id) FROM 1 FOR 8),
      l."area",
      l."dayOfWeek",
      l."leagueType",
      l."venueName",
      TRUE,
      northallerton_league_id,
      NOW(),
      NOW()
    FROM "League" l
    WHERE l."id" = northallerton_league_id
    ON CONFLICT ("id") DO UPDATE
    SET "currentLeagueId" = EXCLUDED."currentLeagueId",
        "updatedAt" = NOW();

    northallerton_competition_id := generated_id;
  END IF;

  -- Keep all clearly-identifiable seasons attached to the correct ongoing
  -- competition. This deliberately uses location/venue metadata rather than
  -- team names.
  UPDATE "League" l
  SET "competitionId" = harrogate_competition_id,
      "updatedAt" = NOW()
  WHERE (
      LOWER(COALESCE(l."name", '')) LIKE '%harrogate%'
      OR LOWER(COALESCE(l."area", '')) LIKE '%harrogate%'
      OR LOWER(COALESCE(l."venueName", '')) LIKE '%rossett%'
    )
    AND l."competitionId" IS DISTINCT FROM harrogate_competition_id;

  UPDATE "League" l
  SET "competitionId" = northallerton_competition_id,
      "updatedAt" = NOW()
  WHERE (
      LOWER(COALESCE(l."name", '')) LIKE '%northallerton%'
      OR LOWER(COALESCE(l."area", '')) LIKE '%northallerton%'
      OR LOWER(COALESCE(l."venueName", '')) LIKE '%northallerton%'
    )
    AND l."competitionId" IS DISTINCT FROM northallerton_competition_id;

  UPDATE "LeagueCompetition"
  SET "currentLeagueId" = harrogate_league_id,
      "updatedAt" = NOW()
  WHERE "id" = harrogate_competition_id;

  UPDATE "LeagueCompetition"
  SET "currentLeagueId" = northallerton_league_id,
      "updatedAt" = NOW()
  WHERE "id" = northallerton_competition_id;

  -- Team.leagueId is the current league cache. Align each team's long-term
  -- competition with that current league, but do not reactivate any season row.
  UPDATE "Team" t
  SET "competitionId" = l."competitionId",
      "updatedAt" = NOW()
  FROM "League" l
  WHERE t."leagueId" = l."id"
    AND l."competitionId" IN (harrogate_competition_id, northallerton_competition_id)
    AND t."competitionId" IS DISTINCT FROM l."competitionId";

  -- Remove current-season cross-contamination in both directions. Historical
  -- memberships in other seasons are left untouched.
  UPDATE "LeagueSeasonTeam" lst
  SET "isActive" = FALSE,
      "divisionId" = NULL,
      "updatedAt" = NOW()
  FROM "Team" t, "League" team_league
  WHERE lst."leagueId" = harrogate_league_id
    AND lst."teamId" = t."id"
    AND t."leagueId" = team_league."id"
    AND team_league."competitionId" = northallerton_competition_id
    AND t."leagueId" <> harrogate_league_id
    AND lst."isActive" = TRUE;

  UPDATE "LeagueSeasonTeam" lst
  SET "isActive" = FALSE,
      "divisionId" = NULL,
      "updatedAt" = NOW()
  FROM "Team" t, "League" team_league
  WHERE lst."leagueId" = northallerton_league_id
    AND lst."teamId" = t."id"
    AND t."leagueId" = team_league."id"
    AND team_league."competitionId" = harrogate_competition_id
    AND t."leagueId" <> northallerton_league_id
    AND lst."isActive" = TRUE;

  -- Explicitly clean the known bad SWAZ/Swaz DSC link if its current league is
  -- Northallerton. This makes the repair resilient even if older competition
  -- metadata was inconsistent enough to defeat the generic check above.
  UPDATE "LeagueSeasonTeam" lst
  SET "isActive" = FALSE,
      "divisionId" = NULL,
      "updatedAt" = NOW()
  FROM "Team" t, "League" current_league
  WHERE lst."leagueId" = harrogate_league_id
    AND lst."teamId" = t."id"
    AND current_league."id" = t."leagueId"
    AND (
      LOWER(COALESCE(current_league."name", '')) LIKE '%northallerton%'
      OR LOWER(COALESCE(current_league."area", '')) LIKE '%northallerton%'
      OR LOWER(COALESCE(current_league."venueName", '')) LIKE '%northallerton%'
    )
    AND REGEXP_REPLACE(LOWER(TRIM(t."name")), '[^a-z0-9]+', '', 'g') IN (
      'swaz', 'swazfc', 'swazdsc'
    );

  -- If a current Northallerton team's cached division came from Harrogate,
  -- clear only that invalid cache. Its Northallerton season membership remains
  -- the authoritative division assignment.
  UPDATE "Team" t
  SET "divisionId" = NULL,
      "updatedAt" = NOW()
  FROM "LeagueDivision" d, "League" current_league
  WHERE t."divisionId" = d."id"
    AND current_league."id" = t."leagueId"
    AND current_league."competitionId" = northallerton_competition_id
    AND d."leagueId" = harrogate_league_id;
END $$;
