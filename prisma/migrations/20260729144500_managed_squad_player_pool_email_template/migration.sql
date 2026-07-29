-- ========================================
-- Migration: managed squad PlayerPool invitation template
-- ========================================

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
  'managed-squad-player-pool-opportunity',
  'managed-squad-player-pool-opportunity',
  'Managed squad player — PlayerPool opportunity',
  'Optional invitation for an existing managed-squad player who may want additional or more regular football without leaving their current squad.',
  'GENERAL',
  NULL,
  'Would you like the opportunity to play more regularly?',
  $body$Hi {{firstName}},

You are currently registered with {{teamName}}, but we appreciate that with a larger squad, not every player will necessarily get a game every week.

If you are not getting as much football as you would like, we would like to offer you the option of also joining the SIXFL PlayerPool.

This is completely optional and does not mean leaving {{teamName}}. You would remain part of the squad, but your anonymised playing profile could also be seen by suitable SIXFL teams that are looking for players.

The PlayerPool may help you find occasional additional games, help another team when they are short, or potentially find a team where you can play more regularly.

Your name and contact details will not be shown to captains. A team can only request an introduction through SIXFL, and we will not share your details unless you agree. There is no obligation to accept any introduction, and you can pause your profile whenever you wish.

{{cta}}

If you are happy with the amount of football you currently get, or do not want to be considered by other teams, you do not need to do anything.$body$,
  'Join the PlayerPool',
  'signupUrl',
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
