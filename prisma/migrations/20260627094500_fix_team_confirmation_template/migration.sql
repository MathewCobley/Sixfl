-- ========================================
-- Migration: fix team confirmation email formatting
-- ========================================

UPDATE "EmailTemplate"
SET
  "name" = 'Team place confirmation email',
  "description" = 'Ask a team lead to confirm they want a league place before fixtures are created.',
  "audience" = 'LEAD',
  "interestType" = 'TEAM',
  "subject" = 'Confirm your SIXFL league place — starts 8 July',
  "body" = E'Hi {{firstName}},\n\nThanks for registering interest in joining SIXFL.\n\nWe’re now confirming teams for the new league starting on Tuesday 8 July.\n\nPlaces are filling up quickly, so please confirm whether you would like us to reserve your team’s place.\n\nLeague details:\n\nStart date: Tuesday 8 July\nMatch length: 40 minutes\nCost: £40 per team per match\nFormat: Weekly 6-a-side fixtures\n\nPlease confirm your place using the button below.\n\n{{cta}}\n\nOnce confirmed, we’ll include your team in fixture planning and send the next steps.\n\nIf you’re no longer looking to join, no problem — reply NO and we’ll release the space to another team.\n\nWe’d love to have you involved.',
  "ctaLabel" = 'Yes, confirm our team place',
  "ctaUrlKey" = 'teamConfirmationUrl',
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'team-place-confirmation-email';
