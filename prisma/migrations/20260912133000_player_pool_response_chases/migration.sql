-- Empty audit/uniqueness structures and one editable template only.
-- Migration never queues customer messages or changes a player's status.
CREATE TABLE IF NOT EXISTS "PlayerPoolResponseDecision" (
  id TEXT PRIMARY KEY,
  "profileId" TEXT NOT NULL UNIQUE,
  "publicCode" TEXT NOT NULL,
  answer TEXT NOT NULL CHECK (answer = 'NOT_LOOKING'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDispatch_player_pool_response_once"
  ON "NotificationDispatch" ("sourceType", "sourceId") WHERE "sourceType" = 'PLAYER_POOL_RESPONSE_CHASE';
INSERT INTO "NotificationTemplate" (
  id, key, name, description, kind, channel, audience, subject, body,
  "ctaLabel", "ctaUrlKey", "isActive", "updatedAt"
) VALUES (
  'sixfl-player-pool-response-chase-email', 'player-pool-response-chase-email',
  'PlayerPool — are you still looking? Yes / no response request',
  'One explicit response request for an awaiting profile, after checking contact history. A no closes only the PlayerPool enquiry; silence is not a refusal.',
  'TRANSACTIONAL', 'EMAIL', 'PLAYER',
  'Are you still looking for a SIXFL team, {{firstName}}?',
  $body$Hi {{firstName}},

Are you still looking for a team to play regular local 6-a-side football with?

You are on our SIXFL PlayerPool list, but we are still waiting for your player profile. **Please let us know either way — a no is absolutely fine.**

**Yes, I am interested:** use the button below and complete your short profile. Your area, playing nights, positions and experience help us introduce you to a suitable team.

**No, I am no longer looking:** use the same button and choose “No — I am no longer looking”. We will close your PlayerPool enquiry and stop these profile reminders. You can also reply to this email and tell us.

**Without a response and a completed profile, we cannot introduce you to a team.** If you need help with the form or have a question, just reply — we are happy to help.

Completing a profile is free, does not commit you to joining a team, and does not make your contact details public. SIXFL manages introductions.

{{cta}}

Thanks,
**SIXFL**$body$,
  'Let SIXFL know — yes or no', 'responseUrl', true, CURRENT_TIMESTAMP
) ON CONFLICT (key) DO NOTHING;
