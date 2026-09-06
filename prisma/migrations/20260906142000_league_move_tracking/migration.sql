-- This flag controls admin move-response tracking only, never an actual move.
-- Existing team responses remain untouched. New leagues default to off.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'League' AND column_name = 'isMoving'
  ) THEN
    ALTER TABLE "League" ADD COLUMN "isMoving" BOOLEAN NOT NULL DEFAULT false;

    -- One-time rollout for the league/season identified in the user's report.
    -- Do not re-enable it on migration replay after an admin unticks the box.
    UPDATE "League" SET "isMoving" = true
    WHERE "name" = 'Northallerton Wednesday Mens' AND "season" = 'Summer 2026';
  END IF;
END $$;
