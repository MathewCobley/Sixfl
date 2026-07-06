-- ========================================
-- Referee night pre-match confirmations
-- ========================================

ALTER TABLE "RefereeNight"
  ADD COLUMN IF NOT EXISTS "confirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "confirmationTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmationSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmationLastChasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmationConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmationDeclinedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmationResponseNote" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "RefereeNight_confirmationTokenHash_key"
  ON "RefereeNight" ("confirmationTokenHash")
  WHERE "confirmationTokenHash" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "RefereeNight_confirmationStatus_nightDate_idx"
  ON "RefereeNight" ("confirmationStatus", "nightDate");

CREATE INDEX IF NOT EXISTS "RefereeNight_confirmationLastChasedAt_idx"
  ON "RefereeNight" ("confirmationLastChasedAt");
