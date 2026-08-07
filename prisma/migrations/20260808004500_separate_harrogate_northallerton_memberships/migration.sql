-- Repair Harrogate/Northallerton competition and season membership contamination.
--
-- The visible problem is that Northallerton teams such as AHC AFC can appear as
-- affiliated teams on the Harrogate league page. The affiliated-team list is
-- competition-based, so this happens when the two locations accidentally share
-- parent-competition metadata or a Northallerton team carries Harrogate's
-- competitionId.
--
-- SWAZ / Swaz DSC is a genuine Harrogate team and must remain in Harrogate.

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

  -- Give Harrogate its own parent competition if it has none or is sharing the
  -- Northallerton parent by mistake.
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

  -- Give Northallerton its own parent competition if required.
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

  -- Keep clearly-identifiable seasons attached to the correct ongoing
  -- competition. This deliberately uses location/venue metadata, not team names.
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

  -- Align long-term competition affiliation with the team's actual current
  -- league. This is what removes Northallerton teams such as AHC AFC from the
  -- Harrogate "Affiliated teams" list.
  UPDATE "Team" t
  SET "competitionId" = l."competitionId",
      "updatedAt" = NOW()
  FROM "League" l
  WHERE t."leagueId" = l."id"
    AND l."competitionId" IN (harrogate_competition_id, northallerton_competition_id)
    AND t."competitionId" IS DISTINCT FROM l."competitionId";

  -- Remove current-season cross-contamination in both directions. Historical
  -- memberships in other seasons are left untouched. SWAZ is protected below
  -- and is not removed from Harrogate by this repair.
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
    AND lst."isActive" = TRUE
    AND REGEXP_REPLACE(LOWER(TRIM(t."name")), '[^a-z0-9]+', '', 'g') NOT IN (
      'swaz', 'swazfc', 'swazdsc'
    );

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

  -- AHC AFC is a Northallerton team. If it is carrying any Harrogate season
  -- entry, clear that entry; its Northallerton records remain untouched.
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
    AND REGEXP_REPLACE(LOWER(TRIM(t."name")), '[^a-z0-9]+', '', 'g') = 'ahcafc';

  -- Reassert AHC AFC's parent competition from its Northallerton league. This is
  -- the important fix for the affiliated-team list even when it had no active
  -- Harrogate season entry.
  UPDATE "Team" t
  SET "competitionId" = northallerton_competition_id,
      "updatedAt" = NOW()
  FROM "League" current_league
  WHERE current_league."id" = t."leagueId"
    AND (
      LOWER(COALESCE(current_league."name", '')) LIKE '%northallerton%'
      OR LOWER(COALESCE(current_league."area", '')) LIKE '%northallerton%'
      OR LOWER(COALESCE(current_league."venueName", '')) LIKE '%northallerton%'
    )
    AND REGEXP_REPLACE(LOWER(TRIM(t."name")), '[^a-z0-9]+', '', 'g') = 'ahcafc';

  -- SWAZ / Swaz DSC is a Harrogate team. Preserve the currently active
  -- Harrogate season record and align its cached league/competition fields with
  -- that record. This uses an existing active Harrogate membership as proof; it
  -- never creates a Harrogate SWAZ membership from a name match alone.
  UPDATE "Team" t
  SET "leagueId" = harrogate_league_id,
      "competitionId" = harrogate_competition_id,
      "divisionId" = lst."divisionId",
      "updatedAt" = NOW()
  FROM "LeagueSeasonTeam" lst
  WHERE lst."leagueId" = harrogate_league_id
    AND lst."teamId" = t."id"
    AND lst."isActive" = TRUE
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
