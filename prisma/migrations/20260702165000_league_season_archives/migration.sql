-- Preserve old league tables/results when a league season is changed.

CREATE TABLE "LeagueSeasonArchive" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "seasonName" TEXT NOT NULL,
  "leagueName" TEXT NOT NULL,
  "leagueSlug" TEXT NOT NULL,
  "archiveSlug" TEXT NOT NULL,
  "divisionsJson" JSONB NOT NULL DEFAULT '[]',
  "tableJson" JSONB NOT NULL DEFAULT '[]',
  "fixturesJson" JSONB NOT NULL DEFAULT '[]',
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeagueSeasonArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeagueSeasonArchive_archiveSlug_key" ON "LeagueSeasonArchive"("archiveSlug");
CREATE INDEX "LeagueSeasonArchive_leagueId_archivedAt_idx" ON "LeagueSeasonArchive"("leagueId", "archivedAt");
CREATE INDEX "LeagueSeasonArchive_leagueId_seasonName_idx" ON "LeagueSeasonArchive"("leagueId", "seasonName");

ALTER TABLE "LeagueSeasonArchive"
  ADD CONSTRAINT "LeagueSeasonArchive_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
