-- ========================================
-- Migration: allow moved-back player prospects to be unassigned
-- ========================================

-- Allow a player prospect to sit in the global admin prospect pool without being
-- attached to a current team prospect list.
ALTER TABLE "TeamPlayerProspect"
  DROP CONSTRAINT IF EXISTS "TeamPlayerProspect_teamId_fkey";

ALTER TABLE "TeamPlayerProspect"
  ALTER COLUMN "teamId" DROP NOT NULL;

ALTER TABLE "TeamPlayerProspect"
  ADD CONSTRAINT "TeamPlayerProspect_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Catch up players already moved out of active squads before this migration.
-- These are reusable prospects now, not members of the original team's prospect list.
UPDATE "TeamPlayerProspect"
SET "teamId" = NULL,
    "updatedAt" = NOW()
WHERE "teamId" IS NOT NULL
  AND "status" IN ('BACKUP', 'DECLINED')
  AND (
    "source" IN ('Moved from active squad', 'Marked not interested from squad')
    OR "notes" ILIKE 'Moved back from active squad%'
    OR "notes" ILIKE 'Marked as not interested and removed from the active squad%'
  );
