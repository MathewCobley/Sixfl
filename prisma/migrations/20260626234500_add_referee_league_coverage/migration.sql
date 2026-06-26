-- ========================================
-- File: prisma/migrations/20260626234500_add_referee_league_coverage/migration.sql
-- ========================================

CREATE TABLE IF NOT EXISTS "RefereeLeagueCoverage" (
  "id" TEXT NOT NULL,
  "refereeId" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RefereeLeagueCoverage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefereeLeagueCoverage_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefereeLeagueCoverage_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefereeLeagueCoverage_refereeId_leagueId_key"
  ON "RefereeLeagueCoverage"("refereeId", "leagueId");

CREATE INDEX IF NOT EXISTS "RefereeLeagueCoverage_refereeId_idx"
  ON "RefereeLeagueCoverage"("refereeId");

CREATE INDEX IF NOT EXISTS "RefereeLeagueCoverage_leagueId_idx"
  ON "RefereeLeagueCoverage"("leagueId");
