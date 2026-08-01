-- Store the actual SIXFL leagues each PlayerPool player can attend.
-- Keep PlayerPoolProfile.leagueId as the primary/current context for backwards compatibility.

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
