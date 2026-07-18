-- Injured squad members must not remain available or selectable for future fixtures.

CREATE OR REPLACE FUNCTION enforce_injured_team_member_unavailable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."squadStatus" = 'INJURED'
     AND OLD."squadStatus" IS DISTINCT FROM NEW."squadStatus" THEN

    INSERT INTO "FixtureAvailability" (
      "id",
      "fixtureId",
      "teamMemberId",
      "response",
      "note",
      "respondedAt",
      "createdAt",
      "updatedAt"
    )
    SELECT
      'inj_' || md5(f."id" || ':' || NEW."id"),
      f."id",
      NEW."id",
      'UNAVAILABLE',
      CASE
        WHEN NEW."squadStatusNote" IS NOT NULL AND TRIM(NEW."squadStatusNote") <> ''
          THEN 'Injured: ' || TRIM(NEW."squadStatusNote")
        ELSE 'Player marked injured.'
      END,
      NOW(),
      NOW(),
      NOW()
    FROM "Fixture" f
    WHERE f."kickoffAt" >= NOW()
      AND f."status" IN ('SCHEDULED'::"FixtureStatus", 'POSTPONED'::"FixtureStatus")
      AND (f."homeTeamId" = NEW."teamId" OR f."awayTeamId" = NEW."teamId")
    ON CONFLICT ("fixtureId", "teamMemberId")
    DO UPDATE SET
      "response" = 'UNAVAILABLE',
      "note" = EXCLUDED."note",
      "respondedAt" = NOW(),
      "updatedAt" = NOW();

    UPDATE "FixtureSelection" fs
    SET
      "selectionStatus" = 'NOT_SELECTED',
      "isCaptain" = false,
      "isGoalkeeper" = false,
      "note" = CASE
        WHEN fs."note" IS NULL OR TRIM(fs."note") = '' THEN 'Removed from selection because player is injured.'
        WHEN fs."note" NOT LIKE '%Removed from selection because player is injured.%'
          THEN fs."note" || E'\nRemoved from selection because player is injured.'
        ELSE fs."note"
      END,
      "updatedAt" = NOW()
    FROM "Fixture" f
    WHERE fs."fixtureId" = f."id"
      AND fs."teamMemberId" = NEW."id"
      AND f."kickoffAt" >= NOW()
      AND f."status" IN ('SCHEDULED'::"FixtureStatus", 'POSTPONED'::"FixtureStatus");

    UPDATE "NotificationDispatch"
    SET
      "status" = 'CANCELLED'::"NotificationDispatchStatus",
      "cancelledAt" = NOW(),
      "failureReason" = 'Player marked injured and removed from the future fixture selection.'
    WHERE "sourceType" IN ('FIXTURE_SELECTION_SELECTED', 'FIXTURE_SELECTION_MATCHDAY_REMINDER')
      AND "sourceId" LIKE '%:' || NEW."id" || ':%'
      AND "status" IN ('QUEUED'::"NotificationDispatchStatus", 'PROCESSING'::"NotificationDispatchStatus");

    UPDATE "NotificationDispatch"
    SET
      "status" = 'CANCELLED'::"NotificationDispatchStatus",
      "cancelledAt" = NOW(),
      "failureReason" = 'Player marked injured; future player match fee message cancelled.'
    WHERE "sourceType" IN ('PLAYER_MATCH_FEE_REQUEST', 'PLAYER_MATCH_FEE_CHASE_24H', 'PLAYER_MATCH_FEE_CHASE_72H')
      AND "sourceId" IN (
        SELECT pmf."id"
        FROM "PlayerMatchFee" pmf
        JOIN "Fixture" f ON f."id" = pmf."fixtureId"
        WHERE pmf."teamMemberId" = NEW."id"
          AND pmf."status" = 'OPEN'::"PlayerMatchFeeStatus"
          AND f."kickoffAt" >= NOW()
          AND f."status" IN ('SCHEDULED'::"FixtureStatus", 'POSTPONED'::"FixtureStatus")
      )
      AND "status" IN ('QUEUED'::"NotificationDispatchStatus", 'PROCESSING'::"NotificationDispatchStatus");

    UPDATE "PlayerMatchFee" pmf
    SET
      "status" = 'CANCELLED'::"PlayerMatchFeeStatus",
      "cancelledAt" = NOW(),
      "note" = CASE
        WHEN pmf."note" IS NULL OR TRIM(pmf."note") = '' THEN 'Cancelled because player is injured.'
        WHEN pmf."note" NOT LIKE '%Cancelled because player is injured.%'
          THEN pmf."note" || E'\nCancelled because player is injured.'
        ELSE pmf."note"
      END,
      "updatedAt" = NOW()
    FROM "Fixture" f
    WHERE pmf."fixtureId" = f."id"
      AND pmf."teamMemberId" = NEW."id"
      AND pmf."status" = 'OPEN'::"PlayerMatchFeeStatus"
      AND f."kickoffAt" >= NOW()
      AND f."status" IN ('SCHEDULED'::"FixtureStatus", 'POSTPONED'::"FixtureStatus");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "TeamMember_enforce_injured_unavailable" ON "TeamMember";
CREATE TRIGGER "TeamMember_enforce_injured_unavailable"
AFTER UPDATE OF "squadStatus" ON "TeamMember"
FOR EACH ROW
EXECUTE FUNCTION enforce_injured_team_member_unavailable();

CREATE OR REPLACE FUNCTION prevent_injured_fixture_selection()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."selectionStatus" <> 'NOT_SELECTED'
     AND EXISTS (
       SELECT 1
       FROM "TeamMember" tm
       WHERE tm."id" = NEW."teamMemberId"
         AND tm."squadStatus" = 'INJURED'
     ) THEN
    RAISE EXCEPTION 'Injured players cannot be selected. Mark the player available first.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FixtureSelection_prevent_injured_player_insert" ON "FixtureSelection";
DROP TRIGGER IF EXISTS "FixtureSelection_prevent_injured_player_update" ON "FixtureSelection";
DROP TRIGGER IF EXISTS "FixtureSelection_prevent_injured_player" ON "FixtureSelection";

CREATE TRIGGER "FixtureSelection_prevent_injured_player_insert"
BEFORE INSERT ON "FixtureSelection"
FOR EACH ROW
EXECUTE FUNCTION prevent_injured_fixture_selection();

CREATE TRIGGER "FixtureSelection_prevent_injured_player_update"
BEFORE UPDATE OF "selectionStatus" ON "FixtureSelection"
FOR EACH ROW
EXECUTE FUNCTION prevent_injured_fixture_selection();

-- Apply the same rule to players who were already marked injured before this migration.
INSERT INTO "FixtureAvailability" (
  "id",
  "fixtureId",
  "teamMemberId",
  "response",
  "note",
  "respondedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'inj_' || md5(f."id" || ':' || tm."id"),
  f."id",
  tm."id",
  'UNAVAILABLE',
  CASE
    WHEN tm."squadStatusNote" IS NOT NULL AND TRIM(tm."squadStatusNote") <> ''
      THEN 'Injured: ' || TRIM(tm."squadStatusNote")
    ELSE 'Player marked injured.'
  END,
  NOW(),
  NOW(),
  NOW()
FROM "TeamMember" tm
JOIN "Fixture" f
  ON f."homeTeamId" = tm."teamId" OR f."awayTeamId" = tm."teamId"
WHERE tm."squadStatus" = 'INJURED'
  AND f."kickoffAt" >= NOW()
  AND f."status" IN ('SCHEDULED'::"FixtureStatus", 'POSTPONED'::"FixtureStatus")
ON CONFLICT ("fixtureId", "teamMemberId")
DO UPDATE SET
  "response" = 'UNAVAILABLE',
  "note" = EXCLUDED."note",
  "respondedAt" = NOW(),
  "updatedAt" = NOW();

UPDATE "FixtureSelection" fs
SET
  "selectionStatus" = 'NOT_SELECTED',
  "isCaptain" = false,
  "isGoalkeeper" = false,
  "note" = CASE
    WHEN fs."note" IS NULL OR TRIM(fs."note") = '' THEN 'Removed from selection because player is injured.'
    WHEN fs."note" NOT LIKE '%Removed from selection because player is injured.%'
      THEN fs."note" || E'\nRemoved from selection because player is injured.'
    ELSE fs."note"
  END,
  "updatedAt" = NOW()
FROM "TeamMember" tm, "Fixture" f
WHERE fs."teamMemberId" = tm."id"
  AND fs."fixtureId" = f."id"
  AND tm."squadStatus" = 'INJURED'
  AND f."kickoffAt" >= NOW()
  AND f."status" IN ('SCHEDULED'::"FixtureStatus", 'POSTPONED'::"FixtureStatus");

UPDATE "NotificationDispatch" nd
SET
  "status" = 'CANCELLED'::"NotificationDispatchStatus",
  "cancelledAt" = NOW(),
  "failureReason" = 'Player is injured and unavailable for the future fixture.'
WHERE nd."sourceType" IN ('FIXTURE_SELECTION_SELECTED', 'FIXTURE_SELECTION_MATCHDAY_REMINDER')
  AND nd."status" IN ('QUEUED'::"NotificationDispatchStatus", 'PROCESSING'::"NotificationDispatchStatus")
  AND EXISTS (
    SELECT 1
    FROM "TeamMember" tm
    WHERE tm."squadStatus" = 'INJURED'
      AND nd."sourceId" LIKE '%:' || tm."id" || ':%'
  );

UPDATE "NotificationDispatch" nd
SET
  "status" = 'CANCELLED'::"NotificationDispatchStatus",
  "cancelledAt" = NOW(),
  "failureReason" = 'Player is injured; future player match fee message cancelled.'
WHERE nd."sourceType" IN ('PLAYER_MATCH_FEE_REQUEST', 'PLAYER_MATCH_FEE_CHASE_24H', 'PLAYER_MATCH_FEE_CHASE_72H')
  AND nd."status" IN ('QUEUED'::"NotificationDispatchStatus", 'PROCESSING'::"NotificationDispatchStatus")
  AND nd."sourceId" IN (
    SELECT pmf."id"
    FROM "PlayerMatchFee" pmf
    JOIN "TeamMember" tm ON tm."id" = pmf."teamMemberId"
    JOIN "Fixture" f ON f."id" = pmf."fixtureId"
    WHERE tm."squadStatus" = 'INJURED'
      AND pmf."status" = 'OPEN'::"PlayerMatchFeeStatus"
      AND f."kickoffAt" >= NOW()
      AND f."status" IN ('SCHEDULED'::"FixtureStatus", 'POSTPONED'::"FixtureStatus")
  );

UPDATE "PlayerMatchFee" pmf
SET
  "status" = 'CANCELLED'::"PlayerMatchFeeStatus",
  "cancelledAt" = NOW(),
  "note" = CASE
    WHEN pmf."note" IS NULL OR TRIM(pmf."note") = '' THEN 'Cancelled because player is injured.'
    WHEN pmf."note" NOT LIKE '%Cancelled because player is injured.%'
      THEN pmf."note" || E'\nCancelled because player is injured.'
    ELSE pmf."note"
  END,
  "updatedAt" = NOW()
FROM "TeamMember" tm, "Fixture" f
WHERE pmf."teamMemberId" = tm."id"
  AND pmf."fixtureId" = f."id"
  AND tm."squadStatus" = 'INJURED'
  AND pmf."status" = 'OPEN'::"PlayerMatchFeeStatus"
  AND f."kickoffAt" >= NOW()
  AND f."status" IN ('SCHEDULED'::"FixtureStatus", 'POSTPONED'::"FixtureStatus");
