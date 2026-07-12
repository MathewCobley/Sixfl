ALTER TABLE "Fixture"
ADD COLUMN IF NOT EXISTS "sixflTvRecorded" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Fixture_sixflTvRecorded_idx"
ON "Fixture" ("sixflTvRecorded");
