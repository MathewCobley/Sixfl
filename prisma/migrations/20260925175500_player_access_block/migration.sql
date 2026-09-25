-- Account-wide access blocking for SIXFL users.
-- Blocking preserves the User row and every historical team, fixture, payment
-- and statistics relation. Runtime actions clear live sessions and magic links.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "accessBlockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accessBlockedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "accessBlockedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "accessBlockedByName" TEXT;

CREATE INDEX IF NOT EXISTS "User_accessBlockedAt_idx"
  ON "User"("accessBlockedAt");
