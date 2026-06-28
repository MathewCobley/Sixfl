-- ========================================
-- Migration: team lead confirmation links
-- ========================================

CREATE TYPE "LeadTeamConfirmationStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'DECLINED'
);

CREATE TABLE "LeadTeamConfirmation" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "status" "LeadTeamConfirmationStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadTeamConfirmation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LeadTeamConfirmation"
  ADD CONSTRAINT "LeadTeamConfirmation_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "InterestLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LeadTeamConfirmation_leadId_key" ON "LeadTeamConfirmation"("leadId");
CREATE UNIQUE INDEX "LeadTeamConfirmation_token_key" ON "LeadTeamConfirmation"("token");
CREATE INDEX "LeadTeamConfirmation_status_idx" ON "LeadTeamConfirmation"("status");
CREATE INDEX "LeadTeamConfirmation_sentAt_idx" ON "LeadTeamConfirmation"("sentAt");
CREATE INDEX "LeadTeamConfirmation_confirmedAt_idx" ON "LeadTeamConfirmation"("confirmedAt");

INSERT INTO "EmailTemplate" (
  "id",
  "key",
  "name",
  "description",
  "audience",
  "interestType",
  "subject",
  "body",
  "ctaLabel",
  "ctaUrlKey",
  "isActive",
  "createdAt",
  "updatedAt"
) VALUES (
  'team-place-confirmation-email',
  'team-place-confirmation-email',
  'Team place confirmation email',
  'Ask a team lead to confirm they want a league place before fixtures are created.',
  'LEAD',
  'TEAM',
  'Confirm your SIXFL league place — starts 8 July',
  'Hi {{firstName}},\n\nThanks for registering interest in joining SIXFL.\n\nWe’re now confirming teams for the new league starting on Tuesday 8 July.\n\nPlaces are filling up quickly, so please confirm whether you would like us to reserve your team’s place.\n\nLeague details:\n\nStart date: Tuesday 8 July\nMatch length: 40 minutes\nCost: £40 per team per match\nFormat: Weekly 6-a-side fixtures\n\nPlease confirm your place using the button below.\n\n{{cta}}\n\nOnce confirmed, we’ll include your team in the fixture planning and send the next steps.\n\nIf you’re no longer looking to join, you can reply NO and we’ll release the space to another team.\n\nWe’d love to have you involved.',
  'Yes, confirm our team place',
  'teamConfirmationUrl',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "audience" = EXCLUDED."audience",
  "interestType" = EXCLUDED."interestType",
  "subject" = EXCLUDED."subject",
  "body" = EXCLUDED."body",
  "ctaLabel" = EXCLUDED."ctaLabel",
  "ctaUrlKey" = EXCLUDED."ctaUrlKey",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;
