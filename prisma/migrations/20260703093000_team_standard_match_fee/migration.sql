-- Add a standard match fee to each team.
-- Stored in pence so £40.00 is 4000.

ALTER TABLE "Team"
ADD COLUMN IF NOT EXISTS "standardMatchFeePence" INTEGER NOT NULL DEFAULT 4000;

UPDATE "Team"
SET "standardMatchFeePence" = 4000
WHERE "standardMatchFeePence" IS NULL;
