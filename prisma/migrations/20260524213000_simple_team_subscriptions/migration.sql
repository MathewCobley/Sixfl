-- Add simple Stripe subscription tracking to teams.
-- This is additive only and does not alter existing charges or transactions.

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionPriceId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionCancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionLastInvoiceId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionLastPaymentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionLastPaymentFailedAt" TIMESTAMP(3);

ALTER TABLE "PaymentTransaction"
  ADD COLUMN IF NOT EXISTS "stripeInvoiceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Team_stripeCustomerId_key"
  ON "Team"("stripeCustomerId")
  WHERE "stripeCustomerId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Team_stripeSubscriptionId_key"
  ON "Team"("stripeSubscriptionId")
  WHERE "stripeSubscriptionId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Team_subscriptionStatus_idx"
  ON "Team"("subscriptionStatus");

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTransaction_stripeInvoiceId_key"
  ON "PaymentTransaction"("stripeInvoiceId")
  WHERE "stripeInvoiceId" IS NOT NULL;
