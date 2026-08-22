-- Future league seasons should not require an admin to create/manage a fake TBC team.
-- Provision the hidden fixture-only placeholder at database level whenever a league
-- becomes active. The Team row remains detached from Team.leagueId and is linked
-- only by LeagueSeasonTeam.

CREATE OR REPLACE FUNCTION sixfl_ensure_automatic_tbc_for_league()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  placeholder_team_id TEXT;
  placeholder_membership_id TEXT;
  placeholder_claim_code TEXT;
BEGIN
  IF NEW."isActive" IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" t ON t."id" = lst."teamId"
    WHERE lst."leagueId" = NEW."id"
      AND lst."isActive" = true
      AND COALESCE(t."isFixturePlaceholder", false) = true
  ) THEN
    RETURN NEW;
  END IF;

  placeholder_team_id := 'tbc_' || SUBSTRING(MD5(NEW."id") FROM 1 FOR 24);
  placeholder_membership_id := 'lst_tbc_' || SUBSTRING(MD5(NEW."id") FROM 1 FOR 20);
  placeholder_claim_code := 'TBC-' || UPPER(SUBSTRING(MD5(NEW."id") FROM 1 FOR 12));

  INSERT INTO "Team" (
    "id",
    "name",
    "claimCode",
    "teamMode",
    "isRecruiting",
    "isFixturePlaceholder",
    "leagueId",
    "divisionId",
    "competitionId",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    placeholder_team_id,
    'TBC',
    placeholder_claim_code,
    'STANDARD'::"TeamMode",
    false,
    true,
    NULL,
    NULL,
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT ("id") DO UPDATE
  SET
    "name" = 'TBC',
    "isFixturePlaceholder" = true,
    "leagueId" = NULL,
    "divisionId" = NULL,
    "competitionId" = NULL,
    "teamMode" = 'STANDARD'::"TeamMode",
    "isRecruiting" = false,
    "updatedAt" = NOW();

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
    placeholder_membership_id,
    NEW."id",
    placeholder_team_id,
    NULL,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT ("leagueId", "teamId") DO UPDATE
  SET
    "divisionId" = NULL,
    "isActive" = true,
    "updatedAt" = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "League_ensure_automatic_tbc" ON "League";
CREATE TRIGGER "League_ensure_automatic_tbc"
AFTER INSERT OR UPDATE OF "isActive" ON "League"
FOR EACH ROW
EXECUTE FUNCTION sixfl_ensure_automatic_tbc_for_league();