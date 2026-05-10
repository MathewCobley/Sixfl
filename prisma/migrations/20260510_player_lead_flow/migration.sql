CREATE TYPE "LeadPot" AS ENUM (
  'NEW_INTEREST',
  'MOBILE_ONLY_NEEDS_EMAIL',
  'EMAIL_REQUESTED',
  'NEEDS_YES_CONFIRMATION',
  'CONFIRMED_INTEREST',
  'OPTIONAL_DETAILS_REQUESTED',
  'READY_TO_PLACE',
  'ADDED_TO_SQUAD',
  'DORMANT',
  'NOT_NOW'
);

ALTER TABLE "InterestLead"
  ADD COLUMN "leadPot" "LeadPot" NOT NULL DEFAULT 'NEW_INTEREST',
  ADD COLUMN "chaseStage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastChasedAt" TIMESTAMP(3),
  ADD COLUMN "nextChaseDueAt" TIMESTAMP(3),
  ADD COLUMN "confirmedInterestAt" TIMESTAMP(3),
  ADD COLUMN "optionalDetailsRequestedAt" TIMESTAMP(3);

CREATE INDEX "InterestLead_leadPot_idx" ON "InterestLead"("leadPot");
CREATE INDEX "InterestLead_leagueId_leadPot_idx" ON "InterestLead"("leagueId", "leadPot");
CREATE INDEX "InterestLead_interestType_leadPot_idx" ON "InterestLead"("interestType", "leadPot");
CREATE INDEX "InterestLead_nextChaseDueAt_idx" ON "InterestLead"("nextChaseDueAt");
