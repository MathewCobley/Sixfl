-- A fixture sync writes the base fixture fee back onto PaymentCharge.amountPence.
-- Before the matching code safeguard, that could overwrite an already-applied
-- late-payment admin fee while leaving latePaymentFeeStatus = APPLIED.
--
-- Example of the broken state:
--   expected fixture fee £40
--   late-payment admin fee £10
--   stored PaymentCharge.amountPence £40
-- The captain ledger then inferred an impossible £30 base + £10 fee.
--
-- Repair only the unmistakable reset case: an open/part-paid APPLIED charge whose
-- stored total exactly equals the authoritative base fixture fee. Correct charges
-- already stored as base + admin fee are left untouched.
WITH applied_charge_bases AS (
  SELECT
    charge."id" AS "chargeId",
    charge."amountPence" AS "currentAmountPence",
    charge."latePaymentFeeAmountPence" AS "lateFeePence",
    CASE
      WHEN charge."teamId" = fixture."homeTeamId" THEN
        COALESCE(
          fixture."homeMatchFeePence",
          charged_team."standardMatchFeePence",
          fixture."matchFeePence"
        )
      WHEN charge."teamId" = fixture."awayTeamId" THEN
        COALESCE(
          fixture."awayMatchFeePence",
          charged_team."standardMatchFeePence",
          fixture."matchFeePence"
        )
      ELSE NULL
    END AS "baseAmountPence"
  FROM "PaymentCharge" charge
  INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
  INNER JOIN "Team" charged_team ON charged_team."id" = charge."teamId"
  WHERE charge."latePaymentFeeStatus" = 'APPLIED'::"PaymentLateFeeStatus"
    AND charge."latePaymentFeeAmountPence" > 0
    AND charge."status" IN (
      'OPEN'::"PaymentChargeStatus",
      'PART_PAID'::"PaymentChargeStatus"
    )
),
charges_to_repair AS (
  SELECT
    "chargeId",
    "baseAmountPence" + "lateFeePence" AS "repairedAmountPence"
  FROM applied_charge_bases
  WHERE "baseAmountPence" IS NOT NULL
    AND "baseAmountPence" > 0
    AND "currentAmountPence" = "baseAmountPence"
)
UPDATE "PaymentCharge" charge
SET
  "amountPence" = charges_to_repair."repairedAmountPence",
  "lastStripeCheckoutUrl" = NULL,
  "lastStripeCheckoutSessionId" = NULL,
  "lastStripeCheckoutCreatedAt" = NULL,
  "lastStripeCheckoutAmountPence" = NULL,
  "updatedAt" = NOW()
FROM charges_to_repair
WHERE charge."id" = charges_to_repair."chargeId";
