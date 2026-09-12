-- No messages are sent and no enquiries are closed by this migration.
CREATE TABLE IF NOT EXISTS "PlayerPoolResponseDecision" (
  id TEXT PRIMARY KEY,
  "profileId" TEXT NOT NULL UNIQUE,
  "publicCode" TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision='NOT_LOOKING'),
  "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt")
VALUES ('sixfl-playerpool-response-request-email','player-pool-response-request-email','PlayerPool — still looking? Yes / no request',
  'A short response request for incomplete PlayerPool profiles. Includes a scanner-safe yes/no page and profile link.',
  'TRANSACTIONAL','EMAIL','PLAYER','Still looking for a SIXFL team, {{firstName}}?',
  E'Hi {{firstName}},\n\nAre you still looking for a local SIXFL team? Please let us know either way — a no is absolutely fine.\n\n**Yes, I would like to play:** use the button below and complete your short PlayerPool profile so we know where, when and which positions you can play.\n\n**No, I am no longer looking:** use the same button and choose No. We will close your PlayerPool enquiry and stop these profile reminders. You can also reply to this email and we will help.\n\n**Without a response and a completed profile, we cannot introduce you to a team.**\n\nCompleting the profile is free and does not commit you to joining a team. Your private contact details are not made public.\n\n{{cta}}\n\nThanks,\nSIXFL',
  'Tell us yes or no','responseUrl',true,CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
-- Only replace the exact old default final SMS. Keep all administrator edits,
-- inactive flags and already queued/sent message bodies intact.
UPDATE "NotificationTemplate" SET body =
  'Hi {{firstName}}, final SIXFL PlayerPool reminder: still want a team? Please complete your profile: {{profileUrl}} Without it we cannot introduce you. No longer looking? Reply NO and we will close your enquiry.',
  "updatedAt"=CURRENT_TIMESTAMP
WHERE key='player-pool-profile-final-chase-sms'
  AND body='Hi {{firstName}}, just a final reminder from SIXFL about your PlayerPool profile. If you''d still like us to help find you a team, please complete it here: {{profileUrl}} If you''re no longer looking, you can ignore this message.';
