-- Apply recent/older team subscription Stripe payments to the team's oldest open
-- PaymentCharge where possible. These transactions already knew the team, but
-- subscription invoices did not carry a specific chargeId.

WITH candidate_transactions AS (
  SELECT
    tx."id" AS "transactionId",
    tx."teamId",
    tx."amountPence",
    tx."paidAt"
  FROM "PaymentTransaction" tx
  WHERE tx."chargeId" IS NULL
    AND tx."method" = 'STRIPE'
    AND (
      tx."stripeInvoiceId" IS NOT NULL
      OR tx."notes" ILIKE '%Recurring team subscription%'
    )
), open_charges AS (
  SELECT
    pc."id" AS "chargeId",
    pc."teamId",
    pc."amountPence",
    COALESCE(SUM(linked_tx."amountPence"), 0)::int AS "paidPence",
    COALESCE(pc."dueDate", pc."createdAt") AS "sortDate",
    pc."createdAt"
  FROM "PaymentCharge" pc
  LEFT JOIN "PaymentTransaction" linked_tx ON linked_tx."chargeId" = pc."id"
  WHERE pc."status" <> 'VOID'
  GROUP BY pc."id", pc."teamId", pc."amountPence", pc."dueDate", pc."createdAt"
  HAVING pc."amountPence" > COALESCE(SUM(linked_tx."amountPence"), 0)
), ranked_matches AS (
  SELECT
    tx."transactionId",
    charge."chargeId",
    ROW_NUMBER() OVER (
      PARTITION BY tx."transactionId"
      ORDER BY
        CASE WHEN (charge."amountPence" - charge."paidPence") = tx."amountPence" THEN 0 ELSE 1 END,
        charge."sortDate" ASC,
        charge."createdAt" ASC
    ) AS rn
  FROM candidate_transactions tx
  JOIN open_charges charge ON charge."teamId" = tx."teamId"
)
UPDATE "PaymentTransaction" tx
SET
  "chargeId" = ranked."chargeId",
  "notes" = CASE
    WHEN tx."notes" ILIKE '%applied to the oldest open team charge%' THEN tx."notes"
    ELSE COALESCE(tx."notes", 'Recurring team subscription paid via Stripe.') || ' Applied to the oldest open team charge.'
  END
FROM ranked_matches ranked
WHERE tx."id" = ranked."transactionId"
  AND ranked.rn = 1;

-- Refresh charge status after applying the payments.
UPDATE "PaymentCharge" pc
SET "status" = CASE
  WHEN totals."paidPence" >= pc."amountPence" THEN 'PAID'::"PaymentChargeStatus"
  WHEN totals."paidPence" > 0 THEN 'PART_PAID'::"PaymentChargeStatus"
  ELSE 'OPEN'::"PaymentChargeStatus"
END
FROM (
  SELECT
    pc_inner."id" AS "chargeId",
    COALESCE(SUM(tx."amountPence"), 0)::int AS "paidPence"
  FROM "PaymentCharge" pc_inner
  LEFT JOIN "PaymentTransaction" tx ON tx."chargeId" = pc_inner."id"
  WHERE pc_inner."status" <> 'VOID'
  GROUP BY pc_inner."id"
) totals
WHERE pc."id" = totals."chargeId"
  AND pc."status" <> 'VOID';
