-- Link Goal of the Month nominations to the exact private SIXFL TV clip.
-- Existing monthly nominees remain valid and continue using their historic goalNumber/video links.

ALTER TABLE "SixflTvFootageAsset"
  ADD COLUMN IF NOT EXISTS "clipNumber" INTEGER;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "fixtureId"
      ORDER BY "position" ASC, "createdAt" ASC, "id" ASC
    )::int AS "clipNumber"
  FROM "SixflTvFootageAsset"
  WHERE "kind" = 'CLIP'
    AND "fixtureId" IS NOT NULL
)
UPDATE "SixflTvFootageAsset" asset
SET "clipNumber" = numbered."clipNumber"
FROM numbered
WHERE asset."id" = numbered."id"
  AND asset."clipNumber" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "SixflTvFootageAsset_fixture_clip_number_key"
  ON "SixflTvFootageAsset" ("fixtureId", "clipNumber")
  WHERE "kind" = 'CLIP' AND "fixtureId" IS NOT NULL AND "clipNumber" IS NOT NULL;

ALTER TABLE "GoalOfMonthCandidate"
  ADD COLUMN IF NOT EXISTS "clipAssetId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'GoalOfMonthCandidate_clipAssetId_fkey'
  ) THEN
    ALTER TABLE "GoalOfMonthCandidate"
      ADD CONSTRAINT "GoalOfMonthCandidate_clipAssetId_fkey"
      FOREIGN KEY ("clipAssetId") REFERENCES "SixflTvFootageAsset"("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "GoalOfMonthCandidate"
  ALTER COLUMN "goalNumber" DROP NOT NULL;

ALTER TABLE "GoalOfMonthCandidate"
  DROP CONSTRAINT IF EXISTS "GoalOfMonthCandidate_fixtureId_goalNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS "GoalOfMonthCandidate_legacy_goal_key"
  ON "GoalOfMonthCandidate" ("fixtureId", "goalNumber")
  WHERE "clipAssetId" IS NULL AND "goalNumber" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "GoalOfMonthCandidate_clip_asset_key"
  ON "GoalOfMonthCandidate" ("clipAssetId")
  WHERE "clipAssetId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "GoalOfMonthCandidate_clip_asset_idx"
  ON "GoalOfMonthCandidate" ("clipAssetId");
