-- Link existing player/squad payment transactions to their matching fixture/team charge,
-- even where the squad has only partially paid the team fee.
-- This lets admin finance views, including the Night Board, show the real paid amount.

UPDATE "PaymentTransaction" tx
SET "chargeId" = pc."id"
FROM "PlayerMatchFee" pmf
JOIN "PaymentCharge" pc
  ON pc."fixtureId" = pmf."fixtureId"
  AND pc."teamId" = pmf."teamId"
  AND pc."status" <> 'VOID'
WHERE tx."chargeId" IS NULL
  AND tx."teamId" = pmf."teamId"
  AND (
    tx."playerMatchFeeId" = pmf."id"
    OR tx."notes" LIKE ('%Player fee ID: ' || pmf."id" || '%')
  );

-- If a charge now has linked payments but is not fully paid, make sure it is marked PART_PAID.
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

-- If a charge is now covered or overpaid by linked player payments, mark it paid.
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
