-- ========================================
-- Migration: fixture disciplinary notes
-- ========================================

CREATE TYPE "FixtureDisciplinaryIncidentType" AS ENUM (
  'DISSENT',
  'FIGHTING',
  'AGGRESSIVE_CONDUCT',
  'OFFENSIVE_LANGUAGE',
  'THREATENING_BEHAVIOUR',
  'OTHER'
);

CREATE TYPE "FixtureDisciplinarySeverity" AS ENUM (
  'NOTE',
  'WARNING',
  'SERIOUS',
  'URGENT'
);

CREATE TABLE "FixtureDisciplinaryNote" (
  "id" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "refereeNightId" TEXT,
  "reportedByUserId" TEXT,
  "incidentType" "FixtureDisciplinaryIncidentType" NOT NULL,
  "severity" "FixtureDisciplinarySeverity" NOT NULL DEFAULT 'NOTE',
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FixtureDisciplinaryNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FixtureDisciplinaryNote"
  ADD CONSTRAINT "FixtureDisciplinaryNote_fixtureId_fkey"
  FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixtureDisciplinaryNote"
  ADD CONSTRAINT "FixtureDisciplinaryNote_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixtureDisciplinaryNote"
  ADD CONSTRAINT "FixtureDisciplinaryNote_refereeNightId_fkey"
  FOREIGN KEY ("refereeNightId") REFERENCES "RefereeNight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FixtureDisciplinaryNote"
  ADD CONSTRAINT "FixtureDisciplinaryNote_reportedByUserId_fkey"
  FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FixtureDisciplinaryNote_fixtureId_idx" ON "FixtureDisciplinaryNote"("fixtureId");
CREATE INDEX "FixtureDisciplinaryNote_teamId_idx" ON "FixtureDisciplinaryNote"("teamId");
CREATE INDEX "FixtureDisciplinaryNote_refereeNightId_idx" ON "FixtureDisciplinaryNote"("refereeNightId");
CREATE INDEX "FixtureDisciplinaryNote_reportedByUserId_idx" ON "FixtureDisciplinaryNote"("reportedByUserId");
CREATE INDEX "FixtureDisciplinaryNote_incidentType_idx" ON "FixtureDisciplinaryNote"("incidentType");
CREATE INDEX "FixtureDisciplinaryNote_severity_idx" ON "FixtureDisciplinaryNote"("severity");
CREATE INDEX "FixtureDisciplinaryNote_createdAt_idx" ON "FixtureDisciplinaryNote"("createdAt");
