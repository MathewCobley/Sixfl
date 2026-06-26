-- Add the normal referee cover requirement for each league night.
-- Used by the referee availability dashboard to flag under-covered nights.
ALTER TABLE "League"
ADD COLUMN IF NOT EXISTS "requiredRefereesPerNight" INTEGER NOT NULL DEFAULT 1;
