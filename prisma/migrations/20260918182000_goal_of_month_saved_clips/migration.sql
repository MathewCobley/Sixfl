-- Give every saved highlight clip a permanent fixture-scoped identity and
-- reserve an exact action-frame poster for Goal of the Month.
-- Additive only; source video bytes remain unchanged in private object storage.

ALTER TABLE "SixflTvFootageAsset"
  ADD COLUMN IF NOT EXISTS "clipNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "posterObjectKey" TEXT,
  ADD COLUMN IF NOT EXISTS "posterSizeBytes" INTEGER;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "fixtureId"
      ORDER BY "position" ASC, "createdAt" ASC, "id" ASC
    )::int AS "clipNumber"
  FROM "SixflTvFootageAsset"
  WHERE "kind" = 'CLIP'
)
UPDATE "SixflTvFootageAsset" asset
SET "clipNumber" = numbered."clipNumber"
FROM numbered
WHERE asset."id" = numbered."id"
  AND asset."clipNumber" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "SixflTvFootageAsset_fixture_clip_number_unique"
  ON "SixflTvFootageAsset" ("fixtureId", "clipNumber")
  WHERE "kind" = 'CLIP';
