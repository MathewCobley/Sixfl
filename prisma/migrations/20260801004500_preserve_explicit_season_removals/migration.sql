-- Preserve deliberate season removals.
-- Fixture synchronisation may create a missing membership, but it must never
-- reactivate a LeagueSeasonTeam row that an admin explicitly made inactive.

CREATE OR REPLACE FUNCTION "sync_fixture_season_memberships"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "League" league
    LEFT JOIN "LeagueCompetition" competition
      ON competition."id" = league."competitionId"
    WHERE league."id" = NEW."leagueId"
      AND (
        league."isActive" = TRUE
        OR competition."currentLeagueId" = league."id"
      )
  ) THEN
    -- Only create memberships that do not exist. ON CONFLICT DO NOTHING is
    -- intentional: an existing inactive row represents an explicit removal.
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
    ON CONFLICT ("leagueId", "teamId") DO NOTHING;

    -- Existing active memberships may follow a fixture division change, but
    -- inactive memberships remain untouched.
    UPDATE "LeagueSeasonTeam" membership
    SET
      "divisionId" = COALESCE(NEW."divisionId", membership."divisionId"),
      "updatedAt" = NOW()
    WHERE membership."leagueId" = NEW."leagueId"
      AND membership."teamId" IN (NEW."homeTeamId", NEW."awayTeamId")
      AND membership."isActive" = TRUE;
  END IF;

  RETURN NEW;
END;
$$;

-- Correct the team that was deliberately removed and was accidentally
-- reactivated by the earlier fixture backfill. Keep its competition
-- affiliation, but remove it from every active season/table.
UPDATE "LeagueSeasonTeam" membership
SET
  "isActive" = FALSE,
  "divisionId" = NULL,
  "updatedAt" = NOW()
FROM "Team" team
WHERE membership."teamId" = team."id"
  AND membership."isActive" = TRUE
  AND REGEXP_REPLACE(LOWER(TRIM(team."name")), '[^a-z0-9]+', '', 'g')
      IN ('sixoffenders', 'sixoffendersfc');

UPDATE "Team"
SET
  "divisionId" = NULL,
  "updatedAt" = NOW()
WHERE REGEXP_REPLACE(LOWER(TRIM("name")), '[^a-z0-9]+', '', 'g')
      IN ('sixoffenders', 'sixoffendersfc');
