-- Link older Stripe checkout transactions back to their PaymentCharge where the
-- transaction was recorded without chargeId but the charge kept the checkout
-- session id. This stops real charge payments appearing as "Unlinked payment".

UPDATE "PaymentTransaction" tx
SET "chargeId" = pc."id"
FROM "PaymentCharge" pc
WHERE tx."chargeId" IS NULL
  AND tx."stripeCheckoutSessionId" IS NOT NULL
  AND pc."lastStripeCheckoutSessionId" = tx."stripeCheckoutSessionId";

-- Keep charge status in line after backfilling the links.
UPDATE "PaymentCharge" pc
SET "status" = 'PART_PAID'
FROM (
  SELECT
    pc_inner."id" AS "chargeId",
    pc_inner."amountPence" AS "chargeAmountPence",
    COALESCE(SUM(tx."amountPence"), 0)::int AS "paidPence"
  FROM "PaymentCharge" pc_inner
  JOIN "PaymentTransaction" tx ON tx."chargeId" = pc_inner."id"
  WHERE pc_inner."status" IN ('OPEN', 'PART_PAID')
  GROUP BY pc_inner."id", pc_inner."amountPence"
) totals
WHERE pc."id" = totals."chargeId"
  AND totals."paidPence" > 0
  AND totals."paidPence" < totals."chargeAmountPence";

UPDATE "PaymentCharge" pc
SET "status" = 'PAID'
FROM (
  SELECT
    pc_inner."id" AS "chargeId",
    pc_inner."amountPence" AS "chargeAmountPence",
    COALESCE(SUM(tx."amountPence"), 0)::int AS "paidPence"
  FROM "PaymentCharge" pc_inner
  JOIN "PaymentTransaction" tx ON tx."chargeId" = pc_inner."id"
  WHERE pc_inner."status" IN ('OPEN', 'PART_PAID', 'PAID')
  GROUP BY pc_inner."id", pc_inner."amountPence"
) totals
WHERE pc."id" = totals."chargeId"
  AND totals."paidPence" >= totals."chargeAmountPence";
