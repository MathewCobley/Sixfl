-- ========================================
-- SIXFL PlayerPool
-- ========================================

CREATE TABLE IF NOT EXISTS "PlayerPoolProfile" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "leadId" TEXT,
  "profileToken" TEXT NOT NULL,
  "publicCode" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "area" TEXT,
  "leagueId" TEXT,
  "preferredPosition" TEXT,
  "consentShareProfile" BOOLEAN NOT NULL DEFAULT false,
  "consentContact" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "invitedAt" TIMESTAMP(3),
  "profileSubmittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerPoolProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerPoolProfile_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "TeamPlayerProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerPoolProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "InterestLead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PlayerPoolProfile_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_prospectId_key" ON "PlayerPoolProfile"("prospectId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_leadId_key" ON "PlayerPoolProfile"("leadId") WHERE "leadId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_profileToken_key" ON "PlayerPoolProfile"("profileToken");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_publicCode_key" ON "PlayerPoolProfile"("publicCode");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_emailNormalized_key" ON "PlayerPoolProfile"("emailNormalized");
CREATE INDEX IF NOT EXISTS "PlayerPoolProfile_status_area_idx" ON "PlayerPoolProfile"("status", "area");
CREATE INDEX IF NOT EXISTS "PlayerPoolProfile_leagueId_status_idx" ON "PlayerPoolProfile"("leagueId", "status");

CREATE TABLE IF NOT EXISTS "PlayerPoolIntroductionRequest" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "captainMessage" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "introducedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerPoolIntroductionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerPoolIntroductionRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PlayerPoolProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerPoolIntroductionRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerPoolIntroductionRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolIntroductionRequest_profile_team_key" ON "PlayerPoolIntroductionRequest"("profileId", "teamId");
CREATE INDEX IF NOT EXISTS "PlayerPoolIntroductionRequest_team_status_idx" ON "PlayerPoolIntroductionRequest"("teamId", "status");
CREATE INDEX IF NOT EXISTS "PlayerPoolIntroductionRequest_status_requested_idx" ON "PlayerPoolIntroductionRequest"("status", "requestedAt");
