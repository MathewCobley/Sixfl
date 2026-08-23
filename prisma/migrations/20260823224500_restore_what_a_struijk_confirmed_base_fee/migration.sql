-- Targeted repair for the 04 Aug 2026 What a Struijk vs Reece's Set Pieces
-- payment charge. The original fixture base fee was confirmed as £40. A legacy
-- admin adjustment reduced PaymentCharge.amountPence from £50 to £40 while the
-- separate £10 late-payment fee remained APPLIED. That produced the impossible
-- captain display "£30 base + £10 admin fee = £40".
--
-- Restore the authoritative team-side fixture base to £40 and the APPLIED charge
-- total to £50. The existing £40 Stripe payment then correctly leaves £10 due.

WITH target AS (
  SELECT
    charge."id" AS "chargeId",
    charge."fixtureId" AS "fixtureId",
    charge."teamId" AS "teamId"
  FROM "PaymentCharge" charge
  INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
  WHERE charge."title" = 'Match fee • What a Struijk vs Reece''s Set Pieces'
    AND (fixture."kickoffAt" AT TIME ZONE 'Europe/London')::date = DATE '2026-08-04'
    AND charge."latePaymentFeeStatus" = 'APPLIED'::"PaymentLateFeeStatus"
    AND charge."latePaymentFeeAmountPence" = 1000
    AND charge."amountPence" = 4000
)
UPDATE "Fixture" fixture
SET
  "homeMatchFeePence" = CASE
    WHEN fixture."homeTeamId" = target."teamId" THEN 4000
    ELSE fixture."homeMatchFeePence"
  END,
  "awayMatchFeePence" = CASE
    WHEN fixture."awayTeamId" = target."teamId" THEN 4000
    ELSE fixture."awayMatchFeePence"
  END,
  "updatedAt" = NOW()
FROM target
WHERE fixture."id" = target."fixtureId";

WITH target AS (
  SELECT
    charge."id" AS "chargeId",
    COALESCE(SUM(transaction."amountPence"), 0)::int AS "paidPence"
  FROM "PaymentCharge" charge
  INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
  LEFT JOIN "PaymentTransaction" transaction ON transaction."chargeId" = charge."id"
  WHERE charge."title" = 'Match fee • What a Struijk vs Reece''s Set Pieces'
    AND (fixture."kickoffAt" AT TIME ZONE 'Europe/London')::date = DATE '2026-08-04'
    AND charge."latePaymentFeeStatus" = 'APPLIED'::"PaymentLateFeeStatus"
    AND charge."latePaymentFeeAmountPence" = 1000
    AND charge."amountPence" = 4000
  GROUP BY charge."id"
)
UPDATE "PaymentCharge" charge
SET
  "amountPence" = 5000,
  "status" = CASE
    WHEN target."paidPence" >= 5000 THEN 'PAID'::"PaymentChargeStatus"
    WHEN target."paidPence" > 0 THEN 'PART_PAID'::"PaymentChargeStatus"
    ELSE 'OPEN'::"PaymentChargeStatus"
  END,
  "lastStripeCheckoutUrl" = NULL,
  "lastStripeCheckoutSessionId" = NULL,
  "lastStripeCheckoutCreatedAt" = NULL,
  "lastStripeCheckoutAmountPence" = NULL,
  "updatedAt" = NOW()
FROM target
WHERE charge."id" = target."chargeId";
