-- Save manual night-board pitch hire overrides by date / league / venue scope.
CREATE TABLE IF NOT EXISTS "NightBoardOverride" (
  "scopeKey" TEXT PRIMARY KEY,
  "boardDate" TEXT NOT NULL,
  "leagueId" TEXT,
  "venueId" TEXT,
  "pitchHirePence" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "NightBoardOverride_boardDate_idx"
  ON "NightBoardOverride"("boardDate");

CREATE INDEX IF NOT EXISTS "NightBoardOverride_leagueId_idx"
  ON "NightBoardOverride"("leagueId");

CREATE INDEX IF NOT EXISTS "NightBoardOverride_venueId_idx"
  ON "NightBoardOverride"("venueId");
