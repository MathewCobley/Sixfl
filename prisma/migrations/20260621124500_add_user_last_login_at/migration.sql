-- ========================================
-- Migration: track latest successful dashboard sign-in
-- ========================================

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_lastLoginAt_idx"
  ON "User"("lastLoginAt");
