CREATE OR REPLACE FUNCTION sixfl_enforce_team_member_restrictions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  management_restricted BOOLEAN;
  playing_restricted BOOLEAN;
  playing_until TIMESTAMP(3);
BEGIN
  SELECT
    COALESCE("teamManagementRestricted", false),
    COALESCE("playingRestricted", false),
    "playingRestrictedUntil"
  INTO management_restricted, playing_restricted, playing_until
  FROM "User"
  WHERE "id" = NEW."userId";

  IF management_restricted = true
     AND NEW."role"::text IN ('CAPTAIN', 'MANAGER', 'VICE_CAPTAIN') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SIXFL_TEAM_MANAGEMENT_RESTRICTED';
  END IF;

  IF playing_restricted = true
     AND (playing_until IS NULL OR playing_until > NOW())
     AND NEW."role"::text IN ('PLAYER', 'BACKUP_PLAYER') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SIXFL_PLAYER_PLAYING_RESTRICTED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "TeamMember_participation_restriction_guard" ON "TeamMember";
CREATE TRIGGER "TeamMember_participation_restriction_guard"
BEFORE INSERT OR UPDATE OF "userId", "role"
ON "TeamMember"
FOR EACH ROW
EXECUTE FUNCTION sixfl_enforce_team_member_restrictions();

CREATE OR REPLACE FUNCTION sixfl_enforce_fixture_selection_restrictions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  player_user_id TEXT;
  playing_restricted BOOLEAN;
  playing_until TIMESTAMP(3);
BEGIN
  IF NEW."selectionStatus" NOT IN ('SELECTED', 'BACKUP') THEN
    RETURN NEW;
  END IF;

  SELECT member."userId"
  INTO player_user_id
  FROM "TeamMember" member
  WHERE member."id" = NEW."teamMemberId"
  LIMIT 1;

  IF player_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE("playingRestricted", false),
    "playingRestrictedUntil"
  INTO playing_restricted, playing_until
  FROM "User"
  WHERE "id" = player_user_id;

  IF playing_restricted = true
     AND (playing_until IS NULL OR playing_until > NOW()) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SIXFL_PLAYER_PLAYING_RESTRICTED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "FixtureSelection_participation_restriction_guard" ON "FixtureSelection";
CREATE TRIGGER "FixtureSelection_participation_restriction_guard"
BEFORE INSERT OR UPDATE OF "teamMemberId", "selectionStatus"
ON "FixtureSelection"
FOR EACH ROW
EXECUTE FUNCTION sixfl_enforce_fixture_selection_restrictions();
