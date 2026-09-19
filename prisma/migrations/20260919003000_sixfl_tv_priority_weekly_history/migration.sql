-- Permanent weekly SIXFL TV Priority history.
-- Snapshots deliberately copy league/team names so later renames or moves do not rewrite history.
CREATE TABLE "SixflTvPriorityWeeklySnapshot" (
  "id" TEXT PRIMARY KEY,
  "weekStart" DATE NOT NULL,
  "leagueId" TEXT NOT NULL,
  "leagueName" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "teamName" TEXT NOT NULL,
  "score" INTEGER NOT NULL CHECK ("score" BETWEEN 0 AND 100),
  "qualifies" BOOLEAN NOT NULL,
  "provisional" BOOLEAN NOT NULL,
  "matchesCount" INTEGER NOT NULL CHECK ("matchesCount" >= 0),
  "coreCompletedMatches" INTEGER NOT NULL CHECK ("coreCompletedMatches" >= 0),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "SixflTvPriorityWeeklySnapshot_week_league_team"
  ON "SixflTvPriorityWeeklySnapshot" ("weekStart","leagueId","teamId");

CREATE INDEX "SixflTvPriorityWeeklySnapshot_league_week"
  ON "SixflTvPriorityWeeklySnapshot" ("leagueId","weekStart");

CREATE INDEX "SixflTvPriorityWeeklySnapshot_team_week"
  ON "SixflTvPriorityWeeklySnapshot" ("teamId","weekStart");
