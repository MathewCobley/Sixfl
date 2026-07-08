-- Keep payments safe when a fixture is postponed or cancelled.
-- Unpaid team charges are voided, open player fee links are cancelled, and queued
-- payment / reminder / confirmation messages are cancelled. Paid records are kept.

CREATE OR REPLACE FUNCTION "cleanup_fixture_payments_when_not_playing"()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('POSTPONED', 'CANCELLED') THEN
    -- Void unpaid team match-fee charges for this fixture.
    UPDATE "PaymentCharge" pc
    SET "status" = 'VOID'
    WHERE pc."fixtureId" = NEW."id"
      AND pc."status" <> 'VOID'
      AND NOT EXISTS (
        SELECT 1
        FROM "PaymentTransaction" tx
        WHERE tx."chargeId" = pc."id"
      );

    -- Cancel queued team match-fee messages/reminders for this fixture's charges.
    UPDATE "NotificationDispatch" nd
    SET
      "status" = 'CANCELLED',
      "cancelledAt" = NOW(),
      "failureReason" = CASE
        WHEN NEW."status" = 'POSTPONED'
          THEN 'Fixture was postponed before queued match-fee message was sent.'
        ELSE 'Fixture was cancelled before queued match-fee message was sent.'
      END
    WHERE nd."status" = 'QUEUED'
      AND nd."sourceType" IN ('FIXTURE_MATCH_FEE', 'FIXTURE_MATCH_FEE_REMINDER')
      AND nd."sourceId" IN (
        SELECT pc."id"
        FROM "PaymentCharge" pc
        WHERE pc."fixtureId" = NEW."id"
      );

    -- Cancel open/unpaid player match-fee links for this fixture.
    UPDATE "PlayerMatchFee" pmf
    SET
      "status" = 'CANCELLED',
      "cancelledAt" = COALESCE(pmf."cancelledAt", NOW()),
      "paymentUrl" = NULL,
      "paymentToken" = NULL,
      "note" = CASE
        WHEN pmf."note" IS NULL OR BTRIM(pmf."note") = '' THEN
          CASE
            WHEN NEW."status" = 'POSTPONED'
              THEN 'Cancelled because fixture was postponed before the player paid.'
            ELSE 'Cancelled because fixture was cancelled before the player paid.'
          END
        WHEN pmf."note" ILIKE '%fixture was postponed%' OR pmf."note" ILIKE '%fixture was cancelled%' THEN pmf."note"
        ELSE pmf."note" || E'\n' ||
          CASE
            WHEN NEW."status" = 'POSTPONED'
              THEN 'Cancelled because fixture was postponed before the player paid.'
            ELSE 'Cancelled because fixture was cancelled before the player paid.'
          END
      END
    WHERE pmf."fixtureId" = NEW."id"
      AND pmf."status" = 'OPEN';

    -- Cancel queued player fee messages for this fixture's player fee rows.
    UPDATE "NotificationDispatch" nd
    SET
      "status" = 'CANCELLED',
      "cancelledAt" = NOW(),
      "failureReason" = CASE
        WHEN NEW."status" = 'POSTPONED'
          THEN 'Fixture was postponed before queued player match-fee message was sent.'
        ELSE 'Fixture was cancelled before queued player match-fee message was sent.'
      END
    WHERE nd."status" = 'QUEUED'
      AND nd."sourceType" IN ('PLAYER_MATCH_FEE_REQUEST', 'PLAYER_MATCH_FEE_CHASE_24H', 'PLAYER_MATCH_FEE_CHASE_72H')
      AND nd."sourceId" IN (
        SELECT pmf."id"
        FROM "PlayerMatchFee" pmf
        WHERE pmf."fixtureId" = NEW."id"
      );

    -- Cancel fixture reminders and confirmation chases for this fixture.
    UPDATE "NotificationDispatch" nd
    SET
      "status" = 'CANCELLED',
      "cancelledAt" = NOW(),
      "failureReason" = CASE
        WHEN NEW."status" = 'POSTPONED'
          THEN 'Fixture was postponed before queued fixture message was sent.'
        ELSE 'Fixture was cancelled before queued fixture message was sent.'
      END
    WHERE nd."status" = 'QUEUED'
      AND (
        nd."sourceId" = NEW."id"
        OR nd."sourceId" LIKE NEW."id" || ':%'
      )
      AND nd."sourceType" IN (
        'FIXTURE_REMINDER',
        'FIXTURE_CONFIRMATION_CHASE_SMS',
        'FIXTURE_CONFIRMATION_AUTO_SMS_72H',
        'FIXTURE_CONFIRMATION_AUTO_SMS_24H'
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Fixture_cleanup_payments_when_not_playing" ON "Fixture";

CREATE TRIGGER "Fixture_cleanup_payments_when_not_playing"
AFTER INSERT OR UPDATE OF "status" ON "Fixture"
FOR EACH ROW
WHEN (NEW."status" IN ('POSTPONED', 'CANCELLED'))
EXECUTE FUNCTION "cleanup_fixture_payments_when_not_playing"();

-- Run once for fixtures already marked postponed/cancelled before this trigger existed.
UPDATE "Fixture"
SET "status" = "status"
WHERE "status" IN ('POSTPONED', 'CANCELLED');
