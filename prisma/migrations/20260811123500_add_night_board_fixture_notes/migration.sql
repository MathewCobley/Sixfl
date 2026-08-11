-- Admin-only operational note for match-night use.
-- This is printed on the A5 tally sheet and is not intended as public fixture copy.
ALTER TABLE "Fixture"
  ADD COLUMN IF NOT EXISTS "nightBoardNote" TEXT;
