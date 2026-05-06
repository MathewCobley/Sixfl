-- ========================================
-- File: prisma/migrations/20260506203000_add_player_match_fee_override/migration.sql
-- ========================================

ALTER TABLE "TeamMemberProfile"
  ADD COLUMN IF NOT EXISTS "playerMatchFeePenceOverride" INTEGER;

CREATE INDEX IF NOT EXISTS "TeamMemberProfile_playerMatchFeePenceOverride_idx"
  ON "TeamMemberProfile"("playerMatchFeePenceOverride");
