CREATE TABLE IF NOT EXISTS "LastMinuteReplacementResolution" (
  "id" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "droppedTeamId" TEXT NOT NULL,
  "replacementTeamId" TEXT NOT NULL,
  "opponentTeamId" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,
  CONSTRAINT "LastMinuteReplacementResolution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LastMinuteReplacementResolution_fixture_drop_replacement_key"
  ON "LastMinuteReplacementResolution"("fixtureId", "droppedTeamId", "replacementTeamId");

CREATE INDEX IF NOT EXISTS "LastMinuteReplacementResolution_fixture_resolved_idx"
  ON "LastMinuteReplacementResolution"("fixtureId", "resolvedAt");
