ALTER TABLE "Fixture"
ADD COLUMN IF NOT EXISTS "sixflTvUrl" TEXT;

CREATE INDEX IF NOT EXISTS "Fixture_sixflTvUrl_idx"
ON "Fixture" ("sixflTvUrl");
