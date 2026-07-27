-- Add the editable System Email used when a player is invited to complete
-- their SIXFL PlayerPool profile. Existing administrator edits are preserved.

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
  'tpl_player_pool_profile_invite_email',
  'player-pool-profile-invite-email',
  'PlayerPool profile invitation email',
  'Transactional email inviting an individual player lead to complete their private SIXFL PlayerPool profile.',
  'TRANSACTIONAL'::"NotificationTemplateKind",
  'EMAIL'::"NotificationChannel",
  'PLAYER'::"NotificationAudience",
  'Complete your SIXFL PlayerPool profile',
  'Hi {{firstName}},

You registered as a player with SIXFL. Complete your short PlayerPool profile so relevant teams can see your age group, positions, football experience and availability.

Your name, email address and mobile number remain private until you agree to an introduction.

{{cta}}',
  'Complete my PlayerPool profile',
  'profileUrl',
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "kind" = EXCLUDED."kind",
  "channel" = EXCLUDED."channel",
  "audience" = EXCLUDED."audience",
  "isActive" = true,
  "updatedAt" = NOW();
