-- Link new Goal of the Month nominations to the exact saved SIXFL TV clip.
-- Existing goal-number/YouTube nominations remain valid and unchanged.

ALTER TABLE "GoalOfMonthCandidate"
  ADD COLUMN IF NOT EXISTS "clipAssetId" TEXT;

ALTER TABLE "GoalOfMonthCandidate"
  ALTER COLUMN "goalNumber" DROP NOT NULL;

ALTER TABLE "GoalOfMonthCandidate"
  ADD CONSTRAINT "GoalOfMonthCandidate_clipAssetId_fkey"
  FOREIGN KEY ("clipAssetId")
  REFERENCES "SixflTvFootageAsset"("id")
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS "GoalOfMonthCandidate_clipAssetId_unique"
  ON "GoalOfMonthCandidate" ("clipAssetId")
  WHERE "clipAssetId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "GoalOfMonthCandidate_fixture_clip_idx"
  ON "GoalOfMonthCandidate" ("fixtureId", "clipAssetId");
