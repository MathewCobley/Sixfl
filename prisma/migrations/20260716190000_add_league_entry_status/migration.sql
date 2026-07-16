-- Add separate team/player registration status controls for leagues.
-- This lets a league be full for team entries while still accepting player registrations.

ALTER TABLE "League"
  ADD COLUMN IF NOT EXISTS "teamEntryStatus" TEXT NOT NULL DEFAULT 'OPEN';

ALTER TABLE "League"
  ADD COLUMN IF NOT EXISTS "playerEntryStatus" TEXT NOT NULL DEFAULT 'OPEN';

DO $$
BEGIN
  ALTER TABLE "League"
    ADD CONSTRAINT "League_teamEntryStatus_check"
    CHECK ("teamEntryStatus" IN ('OPEN', 'WAITING_LIST', 'CLOSED'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "League"
    ADD CONSTRAINT "League_playerEntryStatus_check"
    CHECK ("playerEntryStatus" IN ('OPEN', 'CLOSED'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "League_teamEntryStatus_idx"
  ON "League"("teamEntryStatus");

CREATE INDEX IF NOT EXISTS "League_playerEntryStatus_idx"
  ON "League"("playerEntryStatus");

-- Northallerton Wednesday is full for teams now, but players can still register.
UPDATE "League"
SET "teamEntryStatus" = 'WAITING_LIST',
    "playerEntryStatus" = 'OPEN',
    "updatedAt" = NOW()
WHERE "isActive" = true
  AND (
    LOWER(COALESCE("area", '')) = 'northallerton'
    OR LOWER("name") LIKE '%northallerton%'
  )
  AND (
    "dayOfWeek" = 'WEDNESDAY'
    OR LOWER("name") LIKE '%wednesday%'
  );
