-- ========================================
-- File: prisma/migrations/20260619153000_add_standard_billing_starts_at/migration.sql
-- ========================================

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "standardBillingStartsAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Team_standardBillingStartsAt_idx"
  ON "Team"("standardBillingStartsAt");

-- Dynamo Kebab and Crescent United became standard teams on 17 June 2026.
-- Anything for fixtures before that date belongs to the previous managed-team period
-- and must not count towards standard-team squad/player payment collection.
UPDATE "Team"
SET "standardBillingStartsAt" = TIMESTAMP '2026-06-17 00:00:00.000'
WHERE lower("name") IN ('dynamo kebab', 'crescent united');

UPDATE "PlayerMatchFee" pmf
SET
  "status" = 'CANCELLED'::"PlayerMatchFeeStatus",
  "cancelledAt" = COALESCE(pmf."cancelledAt", NOW()),
  "paidAt" = NULL,
  "waivedAt" = NULL,
  "paymentUrl" = NULL,
  "paymentToken" = NULL,
  "note" = CASE
    WHEN pmf."note" IS NULL OR trim(pmf."note") = '' THEN 'Ignored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
    WHEN pmf."note" LIKE '%Ignored for standard-team billing:%' THEN pmf."note"
    ELSE pmf."note" || E'\nIgnored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
  END,
  "updatedAt" = NOW()
FROM "Fixture" f, "Team" t
WHERE pmf."fixtureId" = f."id"
  AND t."id" = pmf."teamId"
  AND t."standardBillingStartsAt" IS NOT NULL
  AND f."kickoffAt" < t."standardBillingStartsAt"
  AND pmf."status" <> 'CANCELLED'::"PlayerMatchFeeStatus";

UPDATE "PaymentCharge" pc
SET
  "status" = 'VOID'::"PaymentChargeStatus",
  "paymentToken" = NULL,
  "lastStripeCheckoutUrl" = NULL,
  "lastStripeCheckoutSessionId" = NULL,
  "lastStripeCheckoutCreatedAt" = NULL,
  "lastStripeCheckoutAmountPence" = NULL,
  "description" = CASE
    WHEN pc."description" IS NULL OR trim(pc."description") = '' THEN 'Ignored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
    WHEN pc."description" LIKE '%Ignored for standard-team billing:%' THEN pc."description"
    ELSE pc."description" || E'\nIgnored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
  END,
  "updatedAt" = NOW()
FROM "Fixture" f, "Team" t
WHERE pc."fixtureId" = f."id"
  AND t."id" = pc."teamId"
  AND t."standardBillingStartsAt" IS NOT NULL
  AND f."kickoffAt" < t."standardBillingStartsAt"
  AND pc."status" <> 'VOID'::"PaymentChargeStatus";
