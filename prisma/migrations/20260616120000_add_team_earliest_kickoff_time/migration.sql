-- Add an optional earliest kick-off restriction for teams.
-- Null means the team can play any early slot.
ALTER TABLE "Team"
ADD COLUMN IF NOT EXISTS "earliestKickoffTime" TEXT;
