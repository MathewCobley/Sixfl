-- Add only response evidence and editable content. No contacts are messaged and
-- no enquiry is closed by deploying this migration. Existing templates are kept.
CREATE TABLE IF NOT EXISTS "PlayerPoolResponseEvent" (
  id TEXT PRIMARY KEY,
  "profileId" TEXT NOT NULL,
  response TEXT NOT NULL CHECK (response IN ('NOT_LOOKING')),
  "previousStatus" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlayerPoolResponseEvent_profile_created_idx"
  ON "PlayerPoolResponseEvent" ("profileId", "createdAt");
INSERT INTO "NotificationTemplate" (
  id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt"
) VALUES (
  'sixfl-playerpool-still-looking-email', 'player-pool-still-looking-email',
  'PlayerPool — are you still looking for a team?',
  'A short yes/no follow-up for incomplete profiles. The No link opens a confirmation form; it never changes status on a GET.',
  'TRANSACTIONAL','EMAIL','PLAYER', 'Are you still looking for a SIXFL team, {{firstName}}?',
  $body$Hi {{firstName}},

Are you still looking for a SIXFL team? **Please let us know either way — a no is absolutely fine.**

**Yes, I would like to play:** please complete your short PlayerPool profile using the button below. We need to know where and when you can play, your usual positions and a little about your experience before we can introduce you to a suitable team.

{{cta}}

**No, I am no longer looking:** [let us know here]({{notLookingUrl}}), or reply to this email. We will close your PlayerPool enquiry and stop these profile reminders. This does not remove you from any team you already belong to.

**Without a response and a completed profile, we cannot introduce you to a team.** Completing the form is free, does not commit you to joining a team and does not guarantee a place. Your contact details are not made public; SIXFL manages introductions.

Need help with the form? Just reply and tell us what is getting in the way.

Thanks,
**SIXFL**$body$,
  'Yes — complete my PlayerPool profile', 'profileUrl', TRUE, CURRENT_TIMESTAMP
) ON CONFLICT (key) DO NOTHING;
-- Update only the untouched old default, never customised/disabled templates.
UPDATE "NotificationTemplate" SET body =
  'Hi {{firstName}}, a final SIXFL PlayerPool reminder. Still looking for a team? Please complete your profile: {{profileUrl}} No longer looking? Let us know here: {{notLookingUrl}} or reply to this text. We need your response and profile before we can introduce you to a team.',
  "updatedAt"=CURRENT_TIMESTAMP
WHERE key='player-pool-profile-final-chase-sms' AND body=
  'Hi {{firstName}}, just a final reminder from SIXFL about your PlayerPool profile. If you''d still like us to help find you a team, please complete it here: {{profileUrl}} If you''re no longer looking, you can ignore this message.';
