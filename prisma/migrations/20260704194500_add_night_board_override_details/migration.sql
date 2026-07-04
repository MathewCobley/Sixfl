-- Store the visible night-board override details as well as the final pitch hire total.
ALTER TABLE "NightBoardOverride"
  ADD COLUMN IF NOT EXISTS "nightPitchCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "nightStartTime" TEXT,
  ADD COLUMN IF NOT EXISTS "nightEndTime" TEXT;
