-- ========================================
-- File: prisma/migrations/20260403_fixture_notifications/migration.sql
-- ========================================
-- Safe live-data migration for fixture publish state.
-- This does NOT reset or wipe data.

ALTER TABLE "Fixture"
ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

-- Backfill existing fixtures so the live public site does not suddenly go blank.
UPDATE "Fixture"
SET "publishedAt" = NOW()
WHERE "publishedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Fixture_leagueId_publishedAt_kickoffAt_idx"
ON "Fixture"("leagueId", "publishedAt", "kickoffAt");
