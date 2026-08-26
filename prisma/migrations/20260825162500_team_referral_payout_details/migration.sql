-- Secure player bank details for earned team-referral rewards.
-- The bank details themselves are encrypted in application code before storage.
ALTER TABLE "TeamReferral"
  ADD COLUMN IF NOT EXISTS "payoutDetailsCiphertext" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutDetailsIv" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutDetailsAuthTag" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutDetailsSubmittedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "TeamReferral_payoutDetailsSubmittedAt_idx"
  ON "TeamReferral"("payoutDetailsSubmittedAt");
