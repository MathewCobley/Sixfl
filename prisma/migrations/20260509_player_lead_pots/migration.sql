CREATE TYPE "PlayerJourneyStatus" AS ENUM (
  'SMS_LEAD',
  'ACTIVE_LEAD',
  'PRE_ACTIVATION_SQUAD_PLAYER',
  'ACTIVE_SQUAD_PLAYER',
  'QUIET_LEAD',
  'QUIET_SQUAD_PLAYER',
  'MOVED'
);

ALTER TABLE "InterestLead"
  ADD COLUMN "playerJourneyStatus" "PlayerJourneyStatus" NOT NULL DEFAULT 'ACTIVE_LEAD',
  ADD COLUMN "chaseStage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastChasedAt" TIMESTAMP(3),
  ADD COLUMN "nextChaseDueAt" TIMESTAMP(3),
  ADD COLUMN "confirmedInterestAt" TIMESTAMP(3),
  ADD COLUMN "optionalDetailsRequestedAt" TIMESTAMP(3);

UPDATE "InterestLead"
SET "playerJourneyStatus" = 'SMS_LEAD'
WHERE "interestType" = 'PLAYER'
  AND COALESCE(NULLIF(TRIM("phone"), ''), '') <> ''
  AND COALESCE(NULLIF(TRIM("email"), ''), '') = ''
  AND "convertedAt" IS NULL
  AND "status" <> 'CLOSED';

UPDATE "InterestLead"
SET "playerJourneyStatus" = 'ACTIVE_LEAD'
WHERE "interestType" = 'PLAYER'
  AND COALESCE(NULLIF(TRIM("email"), ''), '') <> ''
  AND "status" IN ('NEW', 'CONTACTED')
  AND "convertedAt" IS NULL;

UPDATE "InterestLead"
SET "playerJourneyStatus" = 'PRE_ACTIVATION_SQUAD_PLAYER'
WHERE "interestType" = 'PLAYER'
  AND "status" = 'QUALIFIED'
  AND "convertedAt" IS NULL;

UPDATE "InterestLead"
SET "playerJourneyStatus" = 'ACTIVE_SQUAD_PLAYER'
WHERE "interestType" = 'PLAYER'
  AND "convertedAt" IS NOT NULL;

UPDATE "InterestLead"
SET "playerJourneyStatus" = 'QUIET_LEAD'
WHERE "interestType" = 'PLAYER'
  AND "status" = 'CLOSED'
  AND "convertedAt" IS NULL;

CREATE INDEX "InterestLead_playerJourneyStatus_idx" ON "InterestLead"("playerJourneyStatus");
CREATE INDEX "InterestLead_leagueId_playerJourneyStatus_idx" ON "InterestLead"("leagueId", "playerJourneyStatus");
CREATE INDEX "InterestLead_interestType_playerJourneyStatus_idx" ON "InterestLead"("interestType", "playerJourneyStatus");
CREATE INDEX "InterestLead_nextChaseDueAt_idx" ON "InterestLead"("nextChaseDueAt");
