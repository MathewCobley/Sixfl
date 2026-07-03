-- Add operational booking and venue cost fields for night board calculations.

ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "defaultPitchCostPerHourPence" INTEGER;

ALTER TABLE "League"
  ADD COLUMN IF NOT EXISTS "bookedPitchCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "bookingStartTime" TEXT,
  ADD COLUMN IF NOT EXISTS "bookingEndTime" TEXT,
  ADD COLUMN IF NOT EXISTS "pitchCostPerHourOverridePence" INTEGER;

CREATE INDEX IF NOT EXISTS "Venue_defaultPitchCostPerHourPence_idx"
  ON "Venue" ("defaultPitchCostPerHourPence");

CREATE INDEX IF NOT EXISTS "League_bookedPitchCount_idx"
  ON "League" ("bookedPitchCount");
