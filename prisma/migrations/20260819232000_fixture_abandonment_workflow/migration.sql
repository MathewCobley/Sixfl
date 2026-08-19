CREATE TABLE IF NOT EXISTS "FixtureAbandonment" (
  "id" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "refereeNightId" TEXT,
  "reason" TEXT NOT NULL,
  "responsibleTeamId" TEXT,
  "innocentTeamId" TEXT,
  "details" TEXT,
  "responsibleOriginalFeePence" INTEGER,
  "innocentOriginalFeePence" INTEGER,
  "responsibleFinalChargePence" INTEGER,
  "innocentPaidPence" INTEGER NOT NULL DEFAULT 0,
  "innocentCreditPence" INTEGER NOT NULL DEFAULT 0,
  "homeScoreAtAbandonment" INTEGER,
  "awayScoreAtAbandonment" INTEGER,
  "recordedByUserId" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixtureAbandonment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FixtureAbandonment_fixtureId_key"
  ON "FixtureAbandonment"("fixtureId");

CREATE INDEX IF NOT EXISTS "FixtureAbandonment_responsibleTeamId_idx"
  ON "FixtureAbandonment"("responsibleTeamId");

CREATE INDEX IF NOT EXISTS "FixtureAbandonment_recordedAt_idx"
  ON "FixtureAbandonment"("recordedAt");

DO $$ BEGIN
  ALTER TABLE "FixtureAbandonment"
    ADD CONSTRAINT "FixtureAbandonment_fixtureId_fkey"
    FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FixtureAbandonment"
    ADD CONSTRAINT "FixtureAbandonment_responsibleTeamId_fkey"
    FOREIGN KEY ("responsibleTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FixtureAbandonment"
    ADD CONSTRAINT "FixtureAbandonment_innocentTeamId_fkey"
    FOREIGN KEY ("innocentTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
