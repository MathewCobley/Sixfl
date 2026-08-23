-- Repair applied late-payment fees on charges that had already reached PAID before
-- the earlier reset repair was introduced.
--
-- Broken historical state:
--   authoritative base fixture fee £40
--   late-payment admin fee £10 marked APPLIED
--   PaymentCharge.amountPence still £40
--   team has paid £40, so stored status is PAID
--
-- The correct state is a £50 total charge with £40 covered and £10 outstanding.
-- The earlier 20260821140000 repair intentionally handled only OPEN/PART_PAID rows,
-- so already-PAID rows were left behind and the captain UI inferred £30 + £10.
WITH applied_paid_charge_bases AS (
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
    AND charge."status" = 'PAID'::"PaymentChargeStatus"
),
charges_to_repair AS (
  SELECT
    "chargeId",
    "baseAmountPence" + "lateFeePence" AS "repairedAmountPence"
  FROM applied_paid_charge_bases
  WHERE "baseAmountPence" IS NOT NULL
    AND "baseAmountPence" > 0
    AND "currentAmountPence" = "baseAmountPence"
)
UPDATE "PaymentCharge" charge
SET
  "amountPence" = charges_to_repair."repairedAmountPence",
  -- PART_PAID is deliberately used as the stored status. The normal payment
  -- summary then recalculates PAID if real cash/player coverage/waiver actually
  -- reaches the repaired total. This avoids a stale PAID status hiding the £10.
  "status" = 'PART_PAID'::"PaymentChargeStatus",
  "lastStripeCheckoutUrl" = NULL,
  "lastStripeCheckoutSessionId" = NULL,
  "lastStripeCheckoutCreatedAt" = NULL,
  "lastStripeCheckoutAmountPence" = NULL,
  "updatedAt" = NOW()
FROM charges_to_repair
WHERE charge."id" = charges_to_repair."chargeId";
