-- Fully retire the former paid Veo Priority pilot.
--
-- Scope is deliberately exact: only SIXFL's dedicated £5 Veo Priority charges
-- created by the retired feature are touched. Base fixture charges are never
-- selected because these legacy charges have fixtureId NULL, amount 500p and
-- the Veo Priority title/id signature.
--
-- Any genuine cash/card/bank payment already received is returned as team credit
-- before the charge is voided. Existing TEAM_CREDIT transactions are excluded so
-- credit can never be duplicated.

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
ON CONFLICT (id) DO NOTHING;

UPDATE "PaymentCharge"
SET
  status = 'VOID',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "fixtureId" IS NULL
  AND "amountPence" = 500
  AND title LIKE 'Veo Priority — %'
  AND (id LIKE 'veo_%' OR id LIKE 'veo_backfill_%')
  AND status::text <> 'VOID';

UPDATE "VeoFixtureRequest"
SET
  "agreedPence" = 0,
  status = CASE
    WHEN status::text IN ('REQUESTED', 'ACCEPTED') THEN 'UNAVAILABLE'::"VeoFixtureRequestStatus"
    ELSE status
  END,
  revision = revision + 1
WHERE COALESCE("agreedPence", 0) <> 0
   OR status::text IN ('REQUESTED', 'ACCEPTED');

UPDATE "VeoTeamPriority"
SET enabled = FALSE, "updatedAt" = CURRENT_TIMESTAMP
WHERE enabled = TRUE;

UPDATE "VeoPriorityRequest"
SET status = 'DECLINED', "reviewedAt" = COALESCE("reviewedAt", CURRENT_TIMESTAMP)
WHERE status = 'PENDING';
