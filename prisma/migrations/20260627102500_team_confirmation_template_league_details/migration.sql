-- ========================================
-- Migration: use league detail variables in team confirmation email
-- ========================================

UPDATE "EmailTemplate"
SET
  "subject" = 'Confirm your {{leagueName}} place',
  "body" = E'Hi {{firstName}},\n\nThanks for registering interest in joining SIXFL.\n\nWe’re now confirming teams for {{leagueName}}.\n\n{{leagueStartLine}}\n\nPlaces are filling up quickly, so please confirm whether you would like us to reserve your team’s place.\n\nLeague details:\n\n{{leagueDetailsBlock}}\n\nPlease confirm your place using the button below.\n\n{{cta}}\n\nOnce confirmed, we’ll include your team in fixture planning and send the next steps.\n\nIf you’re no longer looking to join, no problem — reply NO and we’ll release the space to another team.\n\nWe’d love to have you involved.',
  "ctaLabel" = 'Yes, confirm our team place',
  "ctaUrlKey" = 'teamConfirmationUrl',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'team-place-confirmation-email';
