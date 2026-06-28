-- Move team place confirmation into the system notification template area.

INSERT INTO "NotificationTemplate" (
  "id",
  "key",
  "name",
  "description",
  "kind",
  "channel",
  "audience",
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
  'System email asking a team lead to confirm a specific league place before fixtures are created.',
  'TRANSACTIONAL',
  'EMAIL',
  'LEAD',
  'Confirm your {{leagueName}} place',
  E'Hi {{firstName}},\n\nThanks for registering interest in joining SIXFL.\n\nWe’re now confirming teams for {{leagueName}}.\n\n{{leagueStartLine}}\n\nPlaces are filling up quickly, so please confirm whether you would like us to reserve your team’s place.\n\nLeague details:\n\n{{leagueDetailsBlock}}\n\nPlease confirm your place using the button below.\n\n{{cta}}\n\nOnce confirmed, we’ll include your team in fixture planning and send the next steps.\n\nIf you’re no longer looking to join, no problem — reply NO and we’ll release the space to another team.\n\nWe’d love to have you involved.',
  'Yes, confirm our team place',
  'teamConfirmationUrl',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "kind" = EXCLUDED."kind",
  "channel" = EXCLUDED."channel",
  "audience" = EXCLUDED."audience",
  "subject" = EXCLUDED."subject",
  "body" = EXCLUDED."body",
  "ctaLabel" = EXCLUDED."ctaLabel",
  "ctaUrlKey" = EXCLUDED."ctaUrlKey",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "EmailTemplate"
SET "isActive" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'team-place-confirmation-email';
