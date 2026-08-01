-- Store the actual SIXFL leagues each PlayerPool player can attend.
-- Keep PlayerPoolProfile.leagueId as the primary/current context for backwards compatibility.

-- PlayerPoolProfile was originally created lazily by the application. Creating it here as
-- well makes this migration safe on a new database where the public page has not yet run.
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
  CONSTRAINT "PlayerPoolProfile_prospectId_fkey"
    FOREIGN KEY ("prospectId") REFERENCES "TeamPlayerProspect"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerPoolProfile_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "InterestLead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PlayerPoolProfile_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_prospectId_key"
  ON "PlayerPoolProfile"("prospectId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_leadId_key"
  ON "PlayerPoolProfile"("leadId")
  WHERE "leadId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_profileToken_key"
  ON "PlayerPoolProfile"("profileToken");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_publicCode_key"
  ON "PlayerPoolProfile"("publicCode");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolProfile_emailNormalized_key"
  ON "PlayerPoolProfile"("emailNormalized");
CREATE INDEX IF NOT EXISTS "PlayerPoolProfile_status_area_idx"
  ON "PlayerPoolProfile"("status", "area");
CREATE INDEX IF NOT EXISTS "PlayerPoolProfile_leagueId_status_idx"
  ON "PlayerPoolProfile"("leagueId", "status");

CREATE TABLE IF NOT EXISTS "PlayerPoolLeaguePreference" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "availabilityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlayerPoolLeaguePreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerPoolLeaguePreference_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "PlayerPoolProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerPoolLeaguePreference_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerPoolLeaguePreference_availabilityStatus_check"
    CHECK (
      "availabilityStatus" IN (
        'AVAILABLE',
        'MOST_WEEKS',
        'SOMETIMES',
        'NOT_AVAILABLE'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPoolLeaguePreference_profile_league_key"
  ON "PlayerPoolLeaguePreference"("profileId", "leagueId");

CREATE INDEX IF NOT EXISTS "PlayerPoolLeaguePreference_league_status_idx"
  ON "PlayerPoolLeaguePreference"("leagueId", "availabilityStatus");

CREATE INDEX IF NOT EXISTS "PlayerPoolLeaguePreference_profile_primary_idx"
  ON "PlayerPoolLeaguePreference"("profileId", "isPrimary");

INSERT INTO "PlayerPoolLeaguePreference" (
  "id",
  "profileId",
  "leagueId",
  "availabilityStatus",
  "isPrimary",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT(profile."id", ':', profile."leagueId"),
  profile."id",
  profile."leagueId",
  'AVAILABLE',
  TRUE,
  COALESCE(profile."profileSubmittedAt", profile."createdAt"),
  CURRENT_TIMESTAMP
FROM "PlayerPoolProfile" profile
WHERE profile."leagueId" IS NOT NULL
ON CONFLICT ("profileId", "leagueId") DO UPDATE SET
  "isPrimary" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;
