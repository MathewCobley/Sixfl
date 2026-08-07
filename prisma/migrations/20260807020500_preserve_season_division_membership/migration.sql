-- Preserve LeagueSeasonTeam as the authoritative current-season division membership.
--
-- The previous trigger copied Team.divisionId into LeagueSeasonTeam every time
-- Team.leagueId or Team.divisionId changed. Team.divisionId is a legacy field
-- and may be stale, so that could move a team into the wrong division.
--
-- This replacement still keeps current-league participation in sync, but an
-- existing active season-team row keeps its own division assignment. A brand
-- new membership may use Team.divisionId only when it belongs to the selected
-- league.

CREATE OR REPLACE FUNCTION "sync_team_league_season_membership"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  valid_new_division_id TEXT;
BEGIN
  IF NEW."leagueId" IS NULL THEN
    UPDATE "LeagueSeasonTeam"
    SET
      "isActive" = FALSE,
      "updatedAt" = NOW()
    WHERE "teamId" = NEW."id"
      AND "isActive" = TRUE;

    RETURN NEW;
  END IF;

  UPDATE "LeagueSeasonTeam"
  SET
    "isActive" = FALSE,
    "updatedAt" = NOW()
  WHERE "teamId" = NEW."id"
    AND "leagueId" <> NEW."leagueId"
    AND "isActive" = TRUE;

  SELECT d."id"
  INTO valid_new_division_id
  FROM "LeagueDivision" d
  WHERE d."id" = NEW."divisionId"
    AND d."leagueId" = NEW."leagueId"
    AND d."isActive" = TRUE
  LIMIT 1;

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
    'lst_' || MD5(NEW."id" || ':' || NEW."leagueId"),
    NEW."leagueId",
    NEW."id",
    valid_new_division_id,
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT ("leagueId", "teamId") DO UPDATE
  SET
    "isActive" = TRUE,
    -- Keep the season membership's existing division when it already has one.
    -- Only fill a blank division from the legacy Team field for a new/blank row.
    "divisionId" = COALESCE("LeagueSeasonTeam"."divisionId", EXCLUDED."divisionId"),
    "updatedAt" = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Team_sync_league_season_membership" ON "Team";

CREATE TRIGGER "Team_sync_league_season_membership"
AFTER INSERT OR UPDATE OF "leagueId"
ON "Team"
FOR EACH ROW
EXECUTE FUNCTION "sync_team_league_season_membership"();
