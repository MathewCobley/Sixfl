-- Let teams choose their kit design before any paid kit rows have unlocked.
-- This is only a design preference; it does not create or authorise a kit order.

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "kitDesignPreferenceId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Team_kitDesignPreferenceId_fkey'
  ) THEN
    ALTER TABLE "Team"
      ADD CONSTRAINT "Team_kitDesignPreferenceId_fkey"
      FOREIGN KEY ("kitDesignPreferenceId") REFERENCES "KitDesign"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Team_kitDesignPreferenceId_idx"
  ON "Team"("kitDesignPreferenceId");
