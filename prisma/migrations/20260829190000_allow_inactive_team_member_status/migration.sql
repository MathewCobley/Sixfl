-- The original TeamMember squad-status constraint only allowed ACTIVE and INJURED.
-- The captain UI and status service now also use INACTIVE for historic/former players,
-- so repair the persisted contract before those status updates are accepted.

ALTER TABLE "TeamMember"
  ADD COLUMN IF NOT EXISTS "squadStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "TeamMember"
  ADD COLUMN IF NOT EXISTS "squadStatusUpdatedAt" TIMESTAMP(3);

ALTER TABLE "TeamMember"
  ADD COLUMN IF NOT EXISTS "squadStatusNote" TEXT;

UPDATE "TeamMember"
SET "squadStatus" = 'ACTIVE'
WHERE "squadStatus" IS NULL
   OR "squadStatus" NOT IN ('ACTIVE', 'INJURED', 'INACTIVE');

ALTER TABLE "TeamMember"
  ALTER COLUMN "squadStatus" SET DEFAULT 'ACTIVE';

ALTER TABLE "TeamMember"
  ALTER COLUMN "squadStatus" SET NOT NULL;

ALTER TABLE "TeamMember"
  DROP CONSTRAINT IF EXISTS "TeamMember_squadStatus_check";

ALTER TABLE "TeamMember"
  ADD CONSTRAINT "TeamMember_squadStatus_check"
  CHECK ("squadStatus" IN ('ACTIVE', 'INJURED', 'INACTIVE'));

CREATE INDEX IF NOT EXISTS "TeamMember_teamId_squadStatus_idx"
  ON "TeamMember"("teamId", "squadStatus");
