-- Fully retire the former paid Veo Priority pilot.
--
-- Scope is deliberately exact: only SIXFL's dedicated £5 Veo Priority charges
-- created by the retired feature are touched. Base fixture charges are never
-- selected because these legacy charges have fixtureId NULL, amount 500p and
-- the Veo Priority title/id signature.
--
-- Any genuine cash/card/bank payment already received is returned as team credit.
-- Existing TEAM_CREDIT transactions are excluded so credit can never be duplicated.
-- The old request-to-charge link is cleared before VOID so the retired Veo database
-- trigger cannot create a second cancellation credit now or after a later receipt edit.

BEGIN;

WITH legacy_veo_charges AS (
  SELECT
    pc.id,
    pc."teamId",
    LEAST(
      500,
      GREATEST(
        COALESCE(
          SUM(
            CASE
              WHEN pt."amountPence" > 0
                AND COALESCE(pt.reference, '') <> 'TEAM_CREDIT'
                AND LOWER(COALESCE(pt.notes, '')) NOT LIKE '%team credit used%'
                AND LOWER(COALESCE(pt.notes, '')) NOT LIKE '%player match fee paid online%'
                AND LOWER(COALESCE(pt.notes, '')) NOT LIKE '%player fee id:%'
              THEN pt."amountPence"
              ELSE 0
            END
          ),
          0
        ),
        0
      )
    )::integer AS "cashPaidPence"
  FROM "PaymentCharge" pc
  LEFT JOIN "PaymentTransaction" pt ON pt."chargeId" = pc.id
  WHERE pc."fixtureId" IS NULL
    AND pc."amountPence" = 500
    AND pc.title LIKE 'Veo Priority — %'
    AND (pc.id LIKE 'veo_%' OR pc.id LIKE 'veo_backfill_%')
  GROUP BY pc.id, pc."teamId"
)
INSERT INTO "TeamCreditLedgerEntry" (
  id,
  "teamId",
  "chargeId",
  "entryType",
  "amountPence",
  description,
  "createdAt"
)
SELECT
  'tcred_veo_retire_' || md5(legacy.id),
  legacy."teamId",
  legacy.id,
  'CREDIT_ADDED'::"TeamCreditLedgerEntryType",
  legacy."cashPaidPence",
  'Former £5 Veo Priority fee retired by SIXFL; money received returned to team credit.',
  CURRENT_TIMESTAMP
FROM legacy_veo_charges legacy
JOIN "Team" team ON team.id = legacy."teamId"
WHERE legacy."cashPaidPence" > 0
  AND team."teamMode"::text = 'STANDARD'
ON CONFLICT (id) DO UPDATE SET
  "teamId" = EXCLUDED."teamId",
  "chargeId" = EXCLUDED."chargeId",
  "entryType" = EXCLUDED."entryType",
  "amountPence" = EXCLUDED."amountPence",
  description = EXCLUDED.description;

-- Break the historical charge link first. The old cancellation-credit trigger
-- only recognises a Veo charge through VeoFixtureRequest. Once unlinked it can no
-- longer create or recreate a second credit row for the retired fee.
UPDATE "VeoFixtureRequest"
SET
  "chargeId" = NULL,
  "agreedPence" = 0,
  status = CASE
    WHEN status IN ('REQUESTED', 'ACCEPTED') THEN 'UNAVAILABLE'
    ELSE status
  END,
  revision = revision + 1
WHERE "chargeId" IN (
    SELECT id
    FROM "PaymentCharge"
    WHERE "fixtureId" IS NULL
      AND "amountPence" = 500
      AND title LIKE 'Veo Priority — %'
      AND (id LIKE 'veo_%' OR id LIKE 'veo_backfill_%')
  )
  OR COALESCE("agreedPence", 0) <> 0
  OR status IN ('REQUESTED', 'ACCEPTED');

-- Replace any earlier cancellation-credit row for the same retired charge with
-- the single canonical tcred_veo_retire_* entry created above.
DELETE FROM "TeamCreditLedgerEntry"
WHERE id IN (
  SELECT 'tcred_veo_cancel_' || pc.id
  FROM "PaymentCharge" pc
  WHERE pc."fixtureId" IS NULL
    AND pc."amountPence" = 500
    AND pc.title LIKE 'Veo Priority — %'
    AND (pc.id LIKE 'veo_%' OR pc.id LIKE 'veo_backfill_%')
);

-- Remove all database-level payment wiring installed by the paid Veo pilot.
-- The camera-booking tables remain because they are still used for free SIXFL TV
-- allocation and recording state.
DROP TRIGGER IF EXISTS "sixfl_veo_receipt_credit" ON "PaymentTransaction";
DROP TRIGGER IF EXISTS "sixfl_veo_void_guard" ON "PaymentCharge";
DROP TRIGGER IF EXISTS "sixfl_veo_void_credit" ON "PaymentCharge";
DROP FUNCTION IF EXISTS sixfl_veo_receipt_credit();
DROP FUNCTION IF EXISTS sixfl_veo_void_guard();
DROP FUNCTION IF EXISTS sixfl_veo_void_credit();
DROP FUNCTION IF EXISTS sixfl_sync_void_veo_credit(TEXT);

-- Keep automatic filming cancellation when a fixture itself is cancelled or
-- postponed, but remove the former PaymentCharge mutation from that trigger.
CREATE OR REPLACE FUNCTION sixfl_cancel_veo_with_fixture() RETURNS trigger LANGUAGE plpgsql AS $veo$
BEGIN
  IF NEW.status::text IN ('CANCELLED','POSTPONED') THEN
    UPDATE "VeoMatchBooking"
    SET state='CANCELLED',
        "updatedAt"=NOW(),
        "recordingNote"='Fixture cancelled or postponed.'
    WHERE "fixtureId"=NEW.id AND state IN ('PLANNED','READY');

    UPDATE "VeoFixtureRequest"
    SET status='CANCELLED',
        "agreedPence"=0,
        revision=revision+1
    WHERE "fixtureId"=NEW.id AND status IN ('REQUESTED','ACCEPTED');
  END IF;
  RETURN NULL;
END
$veo$;

UPDATE "PaymentCharge"
SET
  status = 'VOID',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "fixtureId" IS NULL
  AND "amountPence" = 500
  AND title LIKE 'Veo Priority — %'
  AND (id LIKE 'veo_%' OR id LIKE 'veo_backfill_%')
  AND status::text <> 'VOID';

UPDATE "VeoTeamPriority"
SET enabled = FALSE, "updatedAt" = CURRENT_TIMESTAMP
WHERE enabled = TRUE;

UPDATE "VeoPriorityRequest"
SET status = 'DECLINED', "reviewedAt" = COALESCE("reviewedAt", CURRENT_TIMESTAMP)
WHERE status = 'PENDING';

COMMIT;
