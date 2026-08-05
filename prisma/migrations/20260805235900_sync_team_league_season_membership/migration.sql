-- Keep Team.leagueId and LeagueSeasonTeam participation consistent.
--
-- Team.leagueId = NULL is the explicit admin choice "No league". Any stale
-- active LeagueSeasonTeam row must not keep that team in standings.

-- Repair existing inconsistent records first.
UPDATE "LeagueSeasonTeam" lst
SET
  "isActive" = FALSE,
  "divisionId" = NULL,
  "updatedAt" = NOW()
FROM "Team" team
WHERE team."id" = lst."teamId"
  AND team."leagueId" IS NULL
  AND (lst."isActive" = TRUE OR lst."divisionId" IS NOT NULL);

UPDATE "Team"
SET
  "divisionId" = NULL,
  "updatedAt" = NOW()
WHERE "leagueId" IS NULL
  AND "divisionId" IS NOT NULL;

CREATE OR REPLACE FUNCTION "sync_team_league_season_membership"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."leagueId" IS NULL THEN
    UPDATE "LeagueSeasonTeam"
    SET
      "isActive" = FALSE,
      "divisionId" = NULL,
      "updatedAt" = NOW()
    WHERE "teamId" = NEW."id";

    RETURN NEW;
  END IF;

  -- A team may be affiliated historically with other seasons, but only the
  -- selected current league may remain active after this explicit settings save.
  UPDATE "LeagueSeasonTeam"
  SET
    "isActive" = FALSE,
    "divisionId" = NULL,
    "updatedAt" = NOW()
  WHERE "teamId" = NEW."id"
    AND "leagueId" <> NEW."leagueId";

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
    NEW."divisionId",
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT ("leagueId", "teamId") DO UPDATE
  SET
    "divisionId" = EXCLUDED."divisionId",
    "isActive" = TRUE,
    "updatedAt" = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Team_sync_league_season_membership" ON "Team";

CREATE TRIGGER "Team_sync_league_season_membership"
AFTER INSERT OR UPDATE OF "leagueId", "divisionId"
ON "Team"
FOR EACH ROW
EXECUTE FUNCTION "sync_team_league_season_membership"();
