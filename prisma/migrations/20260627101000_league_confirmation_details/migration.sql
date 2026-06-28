-- ========================================
-- Migration: league confirmation email details
-- ========================================

ALTER TABLE "League"
  ADD COLUMN IF NOT EXISTS "proposedStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "minutesPerGame" INTEGER,
  ADD COLUMN IF NOT EXISTS "costPerTeamPerMatchPence" INTEGER,
  ADD COLUMN IF NOT EXISTS "targetTeamCount" INTEGER;

CREATE INDEX IF NOT EXISTS "League_proposedStartDate_idx" ON "League"("proposedStartDate");

UPDATE "EmailTemplate"
SET
  "name" = 'Team place confirmation email',
  "description" = 'Ask a team lead to confirm they want a specific league place before fixtures are created.',
  "audience" = 'LEAD',
  "interestType" = 'TEAM',
  "subject" = 'Confirm your {{leagueName}} place',
  "body" = E'Hi {{firstName}},\n\nThanks for registering interest in joining SIXFL.\n\nWe’re now confirming teams for {{leagueName}}.\n\n{{leagueStartLine}}\n\nPlaces are filling up quickly, so please confirm whether you would like us to reserve your team’s place.\n\nLeague details:\n\nLeague: {{leagueName}}\nVenue: {{venueName}}\nMatch length: {{minutesPerGame}} minutes\nCost: {{costPerTeamPerMatch}} per team per match\n{{targetTeamCountLine}}\nFormat: Weekly 6-a-side fixtures\n\nPlease confirm your place using the button below.\n\n{{cta}}\n\nOnce confirmed, we’ll include your team in fixture planning and send the next steps.\n\nIf you’re no longer looking to join, no problem — reply NO and we’ll release the space to another team.\n\nWe’d love to have you involved.',
  "ctaLabel" = 'Yes, confirm our team place',
  "ctaUrlKey" = 'teamConfirmationUrl',
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'team-place-confirmation-email';
