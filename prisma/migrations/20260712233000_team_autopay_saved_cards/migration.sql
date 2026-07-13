-- Add saved-card team autopay fields.
-- This replaces unsafe recurring subscriptions for match fees.

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "stripeDefaultPaymentMethodId" TEXT,
  ADD COLUMN IF NOT EXISTS "autoPayEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoPayMandateAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "autoPayMandateText" TEXT,
  ADD COLUMN IF NOT EXISTS "autoPaySetupCheckoutSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "autoPayLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "autoPayLastFailureAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "autoPayLastFailureReason" TEXT;

CREATE INDEX IF NOT EXISTS "Team_autoPayEnabled_idx"
  ON "Team"("autoPayEnabled");

CREATE INDEX IF NOT EXISTS "Team_stripeDefaultPaymentMethodId_idx"
  ON "Team"("stripeDefaultPaymentMethodId")
  WHERE "stripeDefaultPaymentMethodId" IS NOT NULL;
