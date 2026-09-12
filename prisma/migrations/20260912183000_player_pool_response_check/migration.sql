-- Editable follow-up only. Does not queue messages or change any player status.
INSERT INTO "NotificationTemplate" (id, key, name, description, kind, channel, audience,
  subject, body, "ctaLabel", "ctaUrlKey", "isActive", "updatedAt")
VALUES ('sixfl-player-pool-response-check-email', 'player-pool-response-check-email',
  'PlayerPool — are you still looking for a team?',
  'Short yes/no follow-up for incomplete PlayerPool profiles. Replies go to Player comms for review.',
  'TRANSACTIONAL', 'EMAIL', 'PLAYER',
  'Are you still looking for a SIXFL team, {{firstName}}?',
  E'Hi {{firstName}},\n\nAre you still looking for a SIXFL team? Please let us know either way.\n\n**Yes, I would like to play:** please complete your short PlayerPool profile using your secure link below. We need your positions, experience and availability to help match you with a suitable local team.\n\n{{cta}}\n\nOr open your secure profile: {{profileUrl}}\n\n**No, I am no longer looking:** that is absolutely fine — just reply **NO** to this email. We can then close your PlayerPool enquiry and stop these profile reminders.\n\n**Need help or have a question?** Reply to this email and we will help.\n\nWithout a response and a completed profile, we cannot introduce you to a team. Completing it does not charge you anything and does not commit you to joining. Your contact details are not made public.\n\nThanks,\n**SIXFL**',
  'Complete my PlayerPool profile', 'profileUrl', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id, key, name, description, kind, channel, audience,
  body, "isActive", "updatedAt") VALUES
('sixfl-player-pool-response-first-sms', 'player-pool-response-check-first-sms',
 'PlayerPool response check — first SMS', 'First follow-up to the yes/no response-check email.',
 'TRANSACTIONAL', 'SMS', 'PLAYER',
 'Hi {{firstName}}, SIXFL here. Still looking for a team? Complete your PlayerPool profile: {{profileUrl}} Not looking any more? Reply NO and we can close your enquiry. We need your profile before we can introduce you to a team.', TRUE, CURRENT_TIMESTAMP),
('sixfl-player-pool-response-final-sms', 'player-pool-response-check-final-sms',
 'PlayerPool response check — final SMS', 'Final follow-up, only if no response or completed profile is recorded.',
 'TRANSACTIONAL', 'SMS', 'PLAYER',
 'Hi {{firstName}}, a final PlayerPool check from SIXFL. Please complete your profile if you would like help finding a team: {{profileUrl}} A no is fine too — reply NO so we can close your enquiry. Need help? Just reply.', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
