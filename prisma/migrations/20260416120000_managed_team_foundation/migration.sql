-- ========================================
-- File: prisma/migrations/20260416120000_managed_team_foundation/migration.sql
-- ========================================

-- 1) New enum for team mode
CREATE TYPE "TeamMode" AS ENUM ('STANDARD', 'MANAGED');

-- 2) Extend existing TeamRole enum
ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'VICE_CAPTAIN';
ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'BACKUP_PLAYER';

-- 3) Add new Team columns
ALTER TABLE "Team"
ADD COLUMN "teamMode" "TeamMode" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "isRecruiting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "joinSlug" TEXT,
ADD COLUMN "squadTargetSize" INTEGER,
ADD COLUMN "matchdayTargetSize" INTEGER,
ADD COLUMN "managerNotes" TEXT;

-- 4) Team indexes / uniqueness
CREATE UNIQUE INDEX "Team_joinSlug_key" ON "Team"("joinSlug");
CREATE INDEX "Team_teamMode_idx" ON "Team"("teamMode");
CREATE INDEX "Team_isRecruiting_idx" ON "Team"("isRecruiting");
CREATE INDEX "Team_joinSlug_idx" ON "Team"("joinSlug");

-- 5) TeamPlayerProspect table
CREATE TABLE "TeamPlayerProspect" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "preferredPositions" TEXT,
  "experienceSummary" TEXT,
  "availabilitySummary" TEXT,
  "source" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "lastContactedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamPlayerProspect_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeamPlayerProspect_teamId_status_idx" ON "TeamPlayerProspect"("teamId", "status");
CREATE INDEX "TeamPlayerProspect_email_idx" ON "TeamPlayerProspect"("email");
CREATE INDEX "TeamPlayerProspect_phone_idx" ON "TeamPlayerProspect"("phone");

ALTER TABLE "TeamPlayerProspect"
ADD CONSTRAINT "TeamPlayerProspect_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) FixtureAvailability table
CREATE TABLE "FixtureAvailability" (
  "id" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "response" TEXT NOT NULL DEFAULT 'NO_RESPONSE',
  "note" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FixtureAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixtureAvailability_fixtureId_teamMemberId_key" ON "FixtureAvailability"("fixtureId", "teamMemberId");
CREATE INDEX "FixtureAvailability_fixtureId_response_idx" ON "FixtureAvailability"("fixtureId", "response");
CREATE INDEX "FixtureAvailability_teamMemberId_response_idx" ON "FixtureAvailability"("teamMemberId", "response");

ALTER TABLE "FixtureAvailability"
ADD CONSTRAINT "FixtureAvailability_fixtureId_fkey"
FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixtureAvailability"
ADD CONSTRAINT "FixtureAvailability_teamMemberId_fkey"
FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7) FixtureSelection table
CREATE TABLE "FixtureSelection" (
  "id" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "selectionStatus" TEXT NOT NULL DEFAULT 'NOT_SELECTED',
  "isCaptain" BOOLEAN NOT NULL DEFAULT false,
  "isGoalkeeper" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FixtureSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixtureSelection_fixtureId_teamMemberId_key" ON "FixtureSelection"("fixtureId", "teamMemberId");
CREATE INDEX "FixtureSelection_fixtureId_selectionStatus_idx" ON "FixtureSelection"("fixtureId", "selectionStatus");
CREATE INDEX "FixtureSelection_teamMemberId_selectionStatus_idx" ON "FixtureSelection"("teamMemberId", "selectionStatus");

ALTER TABLE "FixtureSelection"
ADD CONSTRAINT "FixtureSelection_fixtureId_fkey"
FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixtureSelection"
ADD CONSTRAINT "FixtureSelection_teamMemberId_fkey"
FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;