-- ========================================
-- File: prisma/migrations/20260626193000_add_referee_availability/migration.sql
-- ========================================

CREATE TABLE IF NOT EXISTS "RefereeAvailability" (
  "id" TEXT NOT NULL,
  "refereeId" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "availabilityDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NO_RESPONSE',
  "note" TEXT,
  "requestedMonth" TEXT,
  "lastRequestedAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RefereeAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefereeAvailability_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefereeAvailability_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefereeAvailability_status_check" CHECK ("status" IN ('AVAILABLE', 'MAYBE', 'UNAVAILABLE', 'NO_RESPONSE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefereeAvailability_refereeId_leagueId_date_key"
  ON "RefereeAvailability"("refereeId", "leagueId", "availabilityDate");

CREATE INDEX IF NOT EXISTS "RefereeAvailability_refereeId_idx"
  ON "RefereeAvailability"("refereeId");

CREATE INDEX IF NOT EXISTS "RefereeAvailability_leagueId_idx"
  ON "RefereeAvailability"("leagueId");

CREATE INDEX IF NOT EXISTS "RefereeAvailability_availabilityDate_idx"
  ON "RefereeAvailability"("availabilityDate");

CREATE INDEX IF NOT EXISTS "RefereeAvailability_status_idx"
  ON "RefereeAvailability"("status");
