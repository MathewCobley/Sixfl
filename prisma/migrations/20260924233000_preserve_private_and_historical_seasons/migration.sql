-- Changing a team's live season must not remove its history or another draft
-- in the SAME competition. No historical rows are rewritten by this migration.
-- Explicit No league and moves to a different competition retain their existing
-- deactivation behaviour. An ordinary update that restates the same league is
-- not a new entry and must not reactivate an explicitly removed membership.
CREATE OR REPLACE FUNCTION "sync_team_league_season_membership"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  valid_new_division_id TEXT;
  target_competition_id TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."leagueId" IS NOT DISTINCT FROM OLD."leagueId" THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW."leagueId" IS NULL THEN
    UPDATE "LeagueSeasonTeam"
    SET "isActive" = FALSE, "updatedAt" = NOW()
    WHERE "teamId" = NEW."id" AND "isActive" = TRUE;
    RETURN NEW;
  END IF;

  SELECT l."competitionId" INTO target_competition_id
  FROM "League" l WHERE l."id" = NEW."leagueId";

  UPDATE "LeagueSeasonTeam" membership
  SET "isActive" = FALSE, "updatedAt" = NOW()
  FROM "League" season
  WHERE membership."teamId" = NEW."id"
    AND membership."leagueId" <> NEW."leagueId"
    AND membership."leagueId" = season."id"
    AND membership."isActive" = TRUE
    AND (
      target_competition_id IS NULL
      OR season."competitionId" IS DISTINCT FROM target_competition_id
    );

  SELECT d."id" INTO valid_new_division_id
  FROM "LeagueDivision" d
  WHERE d."id" = NEW."divisionId"
    AND d."leagueId" = NEW."leagueId" AND d."isActive" = TRUE
  LIMIT 1;

  INSERT INTO "LeagueSeasonTeam" (
    "id", "leagueId", "teamId", "divisionId", "isActive", "createdAt", "updatedAt"
  ) VALUES (
    'lst_' || MD5(NEW."id" || ':' || NEW."leagueId"),
    NEW."leagueId", NEW."id", valid_new_division_id, TRUE, NOW(), NOW()
  )
  ON CONFLICT ("leagueId", "teamId") DO UPDATE
  SET "isActive" = TRUE,
      "divisionId" = COALESCE("LeagueSeasonTeam"."divisionId", EXCLUDED."divisionId"),
      "updatedAt" = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Team_sync_league_season_membership" ON "Team";
CREATE TRIGGER "Team_sync_league_season_membership"
AFTER INSERT OR UPDATE OF "leagueId" ON "Team"
FOR EACH ROW EXECUTE FUNCTION "sync_team_league_season_membership"();
