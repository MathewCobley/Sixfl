-- Response tracker only: existing teams have not been marked as consenting.
-- No league, fixture, squad, message or payment records are changed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TeamMoveConfirmationStatus') THEN
    CREATE TYPE "TeamMoveConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');
  END IF;
END $$;

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "moveConfirmationStatus" "TeamMoveConfirmationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "moveConfirmationUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "moveConfirmationUpdatedBy" TEXT;
