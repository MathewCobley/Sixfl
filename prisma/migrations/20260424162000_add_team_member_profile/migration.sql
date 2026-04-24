-- ========================================
-- Migration: add team member profile table
-- ========================================

CREATE TABLE "TeamMemberProfile" (
  "id" TEXT NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "sourceProspectId" TEXT,
  "phone" TEXT,
  "ageBand" TEXT,
  "preferredPositions" TEXT,
  "experienceSummary" TEXT,
  "availabilityLevel" TEXT,
  "preferredNights" JSONB,
  "availabilitySummary" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamMemberProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamMemberProfile_teamMemberId_key" ON "TeamMemberProfile"("teamMemberId");
CREATE UNIQUE INDEX "TeamMemberProfile_sourceProspectId_key" ON "TeamMemberProfile"("sourceProspectId");
CREATE INDEX "TeamMemberProfile_phone_idx" ON "TeamMemberProfile"("phone");

ALTER TABLE "TeamMemberProfile"
  ADD CONSTRAINT "TeamMemberProfile_teamMemberId_fkey"
  FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMemberProfile"
  ADD CONSTRAINT "TeamMemberProfile_sourceProspectId_fkey"
  FOREIGN KEY ("sourceProspectId") REFERENCES "TeamPlayerProspect"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
