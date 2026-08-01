-- Revert only payment charges changed by the automatic zero-fee reconciliation
-- introduced on 1 August 2026. Viewing the ledger must never alter money.
--
-- The feature added a unique description line in this form:
--   Zero-fee player waiver adjustment: £3.00 removed for Player Name.
-- and reduced amountPence by the same amount. Restore that amount and remove
-- only that generated line. Older records and charges without this marker are
-- left untouched.

WITH affected AS (
  SELECT
    charge."id",
    (
      regexp_match(
        charge."description",
        'Zero-fee player waiver adjustment:[[:space:]]*£([0-9,]+(?:\.[0-9]{1,2})?)'
      )
    )[1] AS "adjustmentText"
  FROM "PaymentCharge" charge
  WHERE charge."updatedAt" >= TIMESTAMPTZ '2026-08-01 20:38:00+00'
    AND charge."description" ~
      'Zero-fee player waiver adjustment:[[:space:]]*£([0-9,]+(?:\.[0-9]{1,2})?)'
),
restored AS (
  UPDATE "PaymentCharge" charge
  SET
    "amountPence" = charge."amountPence"
      + ROUND(REPLACE(affected."adjustmentText", ',', '')::numeric * 100)::integer,
    "description" = NULLIF(
      BTRIM(
        REGEXP_REPLACE(
          charge."description",
          E'(^|\\n)Zero-fee player waiver adjustment:[^\\n]*(\\n|$)',
          E'\\1',
          'g'
        )
      ),
      ''
    ),
    "updatedAt" = NOW()
  FROM affected
  WHERE charge."id" = affected."id"
  RETURNING charge."id"
)
SELECT COUNT(*) FROM restored;
