-- Homepage league-launch pipeline.
--
-- New league records default to FORMING so creating a genuine new launch is
-- enough to make it eligible for the homepage. Admin can move any current
-- league between LIVE, FORMING, PLANNED and HIDDEN from one control screen.
-- Existing seasons are migrated conservatively: current leagues with published
-- fixtures become LIVE; known launch areas become FORMING; Heartlands is hidden
-- in favour of the new town-specific launch strategy.

ALTER TABLE "League"
  ADD COLUMN IF NOT EXISTS "homepageStage" TEXT NOT NULL DEFAULT 'FORMING';

ALTER TABLE "League"
  ADD COLUMN IF NOT EXISTS "homepagePriority" INTEGER NOT NULL DEFAULT 100;

DO $$
BEGIN
  ALTER TABLE "League"
    ADD CONSTRAINT "League_homepageStage_check"
    CHECK ("homepageStage" IN ('LIVE', 'FORMING', 'PLANNED', 'HIDDEN'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "League_homepageStage_homepagePriority_idx"
  ON "League" ("homepageStage", "homepagePriority");

-- Start existing records hidden. We then opt current/relevant leagues back in.
UPDATE "League"
SET "homepageStage" = 'HIDDEN',
    "homepagePriority" = 100;

-- Any current active league that already has published fixtures is genuinely live.
UPDATE "League" league
SET "homepageStage" = 'LIVE',
    "homepagePriority" = 10
FROM "LeagueCompetition" competition
WHERE league."competitionId" = competition."id"
  AND competition."currentLeagueId" = league."id"
  AND league."isActive" = TRUE
  AND EXISTS (
    SELECT 1
    FROM "Fixture" fixture
    WHERE fixture."leagueId" = league."id"
      AND fixture."publishedAt" IS NOT NULL
  );

UPDATE "League" league
SET "homepageStage" = 'LIVE',
    "homepagePriority" = 10
WHERE league."competitionId" IS NULL
  AND league."isActive" = TRUE
  AND EXISTS (
    SELECT 1
    FROM "Fixture" fixture
    WHERE fixture."leagueId" = league."id"
      AND fixture."publishedAt" IS NOT NULL
  );

-- Existing specific launch areas that have not started yet should remain visible
-- as forming leagues. New leagues created after this migration default to FORMING.
UPDATE "League"
SET "homepageStage" = 'FORMING',
    "homepagePriority" = CASE
      WHEN LOWER(COALESCE("area", '')) LIKE '%catterick%'
        OR LOWER("name") LIKE '%catterick%' THEN 20
      WHEN LOWER(COALESCE("area", '')) LIKE '%guisborough%'
        OR LOWER("name") LIKE '%guisborough%' THEN 30
      WHEN (LOWER(COALESCE("area", '')) LIKE '%harrogate%' OR LOWER("name") LIKE '%harrogate%')
        AND "dayOfWeek" = 'THURSDAY'::"PreferredNight" THEN 40
      WHEN LOWER(COALESCE("area", '')) LIKE '%thirsk%'
        OR LOWER("name") LIKE '%thirsk%' THEN 50
      WHEN LOWER(COALESCE("area", '')) LIKE '%wetherby%'
        OR LOWER("name") LIKE '%wetherby%' THEN 60
      ELSE 100
    END
WHERE "isActive" = TRUE
  AND "homepageStage" <> 'LIVE'
  AND (
    LOWER(COALESCE("area", '')) LIKE '%catterick%'
    OR LOWER("name") LIKE '%catterick%'
    OR LOWER(COALESCE("area", '')) LIKE '%guisborough%'
    OR LOWER("name") LIKE '%guisborough%'
    OR (
      (LOWER(COALESCE("area", '')) LIKE '%harrogate%' OR LOWER("name") LIKE '%harrogate%')
      AND "dayOfWeek" = 'THURSDAY'::"PreferredNight"
    )
    OR LOWER(COALESCE("area", '')) LIKE '%thirsk%'
    OR LOWER("name") LIKE '%thirsk%'
    OR LOWER(COALESCE("area", '')) LIKE '%wetherby%'
    OR LOWER("name") LIKE '%wetherby%'
  );

-- Retire the broad catch-all from homepage marketing without deleting its data.
UPDATE "League"
SET "homepageStage" = 'HIDDEN'
WHERE LOWER(COALESCE("name", '')) LIKE '%heartlands%'
   OR LOWER(COALESCE("slug", '')) LIKE '%heartlands%';
