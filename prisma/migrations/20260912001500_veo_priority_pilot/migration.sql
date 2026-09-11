-- Additive only: no existing leagues, fixtures, prices or payments are changed.
CREATE TABLE "VeoLeagueSettings" (
  "leagueId" TEXT PRIMARY KEY REFERENCES "League"("id") ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "pitch" TEXT NOT NULL DEFAULT '',
  "venueId" TEXT REFERENCES "Venue"("id") ON DELETE RESTRICT,
  "maxMatches" INTEGER NOT NULL DEFAULT 3 CHECK ("maxMatches" BETWEEN 1 AND 12),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  CHECK (NOT "enabled" OR length(trim("pitch")) > 0)
);
CREATE TABLE "VeoTeamPriority" (
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  PRIMARY KEY ("leagueId", "teamId")
);
CREATE TABLE "VeoSettingsAudit" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL,
  "teamId" TEXT,
  "actorId" TEXT,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "VeoSettingsAudit_leagueId_createdAt_idx" ON "VeoSettingsAudit"("leagueId", "createdAt");
CREATE TABLE "VeoFixtureSnapshot" (
  "fixtureId" TEXT PRIMARY KEY REFERENCES "Fixture"("id") ON DELETE RESTRICT,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE RESTRICT,
  "kickoffAt" TIMESTAMP(3) NOT NULL,
  "venueId" TEXT,
  "pitch" TEXT,
  "homeTeamId" TEXT NOT NULL,
  "awayTeamId" TEXT NOT NULL,
  "homePriority" BOOLEAN NOT NULL,
  "awayPriority" BOOLEAN NOT NULL,
  "allocated" BOOLEAN NOT NULL,
  "homeBasePence" INTEGER NOT NULL CHECK ("homeBasePence" >= 0),
  "awayBasePence" INTEGER NOT NULL CHECK ("awayBasePence" >= 0),
  "homeSupplementPence" INTEGER NOT NULL,
  "awaySupplementPence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("homeSupplementPence" = CASE WHEN "allocated" AND "homePriority" AND "homeBasePence" > 0 THEN 500 ELSE 0 END),
  CHECK ("awaySupplementPence" = CASE WHEN "allocated" AND "awayPriority" AND "awayBasePence" > 0 THEN 500 ELSE 0 END)
);
CREATE INDEX "VeoFixtureSnapshot_leagueId_kickoffAt_idx" ON "VeoFixtureSnapshot"("leagueId", "kickoffAt");
-- Preserve the original agreement even when an administrator later issues a fee correction.
CREATE FUNCTION sixfl_preserve_veo_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Veo fixture snapshots are permanent. Use the normal payment adjustment workflow for corrections.';
END;
$$;
CREATE TRIGGER "VeoFixtureSnapshot_immutable" BEFORE UPDATE OR DELETE ON "VeoFixtureSnapshot"
FOR EACH ROW EXECUTE FUNCTION sixfl_preserve_veo_snapshot();
