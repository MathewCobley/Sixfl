-- Add parent competitions so each competition can have multiple seasons.
-- Existing League rows remain the season-level records that hold teams, fixtures, results and divisions.

CREATE TABLE "LeagueCompetition" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "area" TEXT,
  "dayOfWeek" "PreferredNight",
  "leagueType" "LeagueType",
  "venueName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "currentLeagueId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeagueCompetition_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "League" ADD COLUMN "competitionId" TEXT;

CREATE UNIQUE INDEX "LeagueCompetition_slug_key" ON "LeagueCompetition"("slug");
CREATE INDEX "LeagueCompetition_isActive_idx" ON "LeagueCompetition"("isActive");
CREATE INDEX "LeagueCompetition_area_idx" ON "LeagueCompetition"("area");
CREATE INDEX "LeagueCompetition_dayOfWeek_idx" ON "LeagueCompetition"("dayOfWeek");
CREATE INDEX "LeagueCompetition_leagueType_idx" ON "LeagueCompetition"("leagueType");
CREATE INDEX "League_competitionId_idx" ON "League"("competitionId");
CREATE INDEX "League_competitionId_season_idx" ON "League"("competitionId", "season");

ALTER TABLE "League"
  ADD CONSTRAINT "League_competitionId_fkey"
  FOREIGN KEY ("competitionId") REFERENCES "LeagueCompetition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeagueCompetition"
  ADD CONSTRAINT "LeagueCompetition_currentLeagueId_fkey"
  FOREIGN KEY ("currentLeagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;
