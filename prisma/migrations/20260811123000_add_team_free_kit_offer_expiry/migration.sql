-- Keep the original free-kit interest/entitlement record intact while allowing
-- SIXFL to mark an unclaimed offer as no longer applied to a particular team.
-- Submitted kit orders are preserved separately and are never removed by this flag.

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "freeKitOfferExpiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "freeKitOfferExpiryReason" TEXT;

CREATE INDEX IF NOT EXISTS "Team_freeKitOfferExpiredAt_idx"
  ON "Team"("freeKitOfferExpiredAt");
