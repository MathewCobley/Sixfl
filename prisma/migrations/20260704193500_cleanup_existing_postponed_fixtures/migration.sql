-- Bring existing postponed fixtures into line with the postponed-fixture behaviour.
-- Unpaid fixture charges are voided. Paid charge records are preserved.
-- Queued match-fee messages and fixture-confirmation chases are cancelled.

WITH postponed_fixtures AS (
  SELECT "id"
  FROM "Fixture"
  WHERE "status" = 'POSTPONED'
), unpaid_charges AS (
  SELECT pc."id"
  FROM "PaymentCharge" pc
  JOIN postponed_fixtures pf ON pf."id" = pc."fixtureId"
  WHERE pc."status" <> 'VOID'
    AND NOT EXISTS (
      SELECT 1
      FROM "PaymentTransaction" pt
      WHERE pt."chargeId" = pc."id"
    )
)
UPDATE "NotificationDispatch" nd
SET
  "status" = 'CANCELLED',
  "cancelledAt" = NOW(),
  "failureReason" = 'Existing postponed fixture cleanup cancelled queued match-fee message.'
WHERE nd."status" = 'QUEUED'
  AND nd."sourceType" IN ('FIXTURE_MATCH_FEE', 'FIXTURE_MATCH_FEE_REMINDER')
  AND nd."sourceId" IN (SELECT "id" FROM unpaid_charges);

WITH postponed_fixtures AS (
  SELECT "id"
  FROM "Fixture"
  WHERE "status" = 'POSTPONED'
), unpaid_charges AS (
  SELECT pc."id"
  FROM "PaymentCharge" pc
  JOIN postponed_fixtures pf ON pf."id" = pc."fixtureId"
  WHERE pc."status" <> 'VOID'
    AND NOT EXISTS (
      SELECT 1
      FROM "PaymentTransaction" pt
      WHERE pt."chargeId" = pc."id"
    )
)
UPDATE "PaymentCharge" pc
SET "status" = 'VOID'
WHERE pc."id" IN (SELECT "id" FROM unpaid_charges);

UPDATE "NotificationDispatch" nd
SET
  "status" = 'CANCELLED',
  "cancelledAt" = NOW(),
  "failureReason" = 'Existing postponed fixture cleanup cancelled queued confirmation chase.'
WHERE nd."status" = 'QUEUED'
  AND nd."sourceType" IN (
    'FIXTURE_CONFIRMATION_CHASE_SMS',
    'FIXTURE_CONFIRMATION_AUTO_SMS_72H',
    'FIXTURE_CONFIRMATION_AUTO_SMS_24H'
  )
  AND EXISTS (
    SELECT 1
    FROM "Fixture" f
    WHERE f."status" = 'POSTPONED'
      AND nd."sourceId" LIKE f."id" || ':%'
  );
