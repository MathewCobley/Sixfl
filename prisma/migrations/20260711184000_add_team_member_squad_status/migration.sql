-- Add squad availability status for managed squads.
-- ACTIVE players can receive normal availability chases.
-- INJURED players stay in the squad but are excluded from future availability reminders.

ALTER TABLE "TeamMember"
  ADD COLUMN IF NOT EXISTS "squadStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "TeamMember"
  ADD COLUMN IF NOT EXISTS "squadStatusUpdatedAt" TIMESTAMP(3);

ALTER TABLE "TeamMember"
  ADD COLUMN IF NOT EXISTS "squadStatusNote" TEXT;

DO $$
BEGIN
  ALTER TABLE "TeamMember"
    ADD CONSTRAINT "TeamMember_squadStatus_check"
    CHECK ("squadStatus" IN ('ACTIVE', 'INJURED'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TeamMember_teamId_squadStatus_idx"
  ON "TeamMember"("teamId", "squadStatus");
