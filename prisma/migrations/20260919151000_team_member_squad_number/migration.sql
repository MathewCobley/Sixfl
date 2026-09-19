CREATE TABLE IF NOT EXISTS "TeamMemberProfile" (
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
  "playerMatchFeePenceOverride" INTEGER,
  "squadNumber" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMemberProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TeamMemberProfile"
  ADD COLUMN IF NOT EXISTS "squadNumber" INTEGER;

ALTER TABLE "TeamMemberProfile"
  DROP CONSTRAINT IF EXISTS "TeamMemberProfile_squadNumber_check";

ALTER TABLE "TeamMemberProfile"
  ADD CONSTRAINT "TeamMemberProfile_squadNumber_check"
  CHECK ("squadNumber" IS NULL OR ("squadNumber" BETWEEN 1 AND 99));

CREATE UNIQUE INDEX IF NOT EXISTS "TeamMemberProfile_teamMemberId_key"
  ON "TeamMemberProfile" ("teamMemberId");

CREATE INDEX IF NOT EXISTS "TeamMemberProfile_squadNumber_idx"
  ON "TeamMemberProfile" ("squadNumber");
