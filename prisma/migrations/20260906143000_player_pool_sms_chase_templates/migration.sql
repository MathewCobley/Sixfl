-- Move the existing two automatic PlayerPool SMS messages into System Templates.
-- Preserve administrator edits and existing dispatch history. No customer messages
-- are sent by this migration and no chase timestamps are reset.
INSERT INTO "NotificationTemplate" (
  id, key, name, description, kind, channel, audience, subject, body,
  "ctaLabel", "ctaUrlKey", "isActive", "updatedAt"
) VALUES (
  'sixfl-player-pool-first-chase-sms', 'player-pool-profile-first-chase-sms',
  'PlayerPool — first profile chase SMS',
  'First automatic SMS, 48 hours after a profile reminder email was sent, only while the profile is incomplete.',
  'TRANSACTIONAL', 'SMS', 'PLAYER', NULL,
  'Hi {{firstName}}, it''s SIXFL. We emailed you your PlayerPool profile link but it looks like you haven''t completed it yet. It only takes a couple of minutes and helps us match you with the right local teams: {{profileUrl}}',
  NULL, NULL, TRUE, CURRENT_TIMESTAMP
) ON CONFLICT (key) DO NOTHING;
INSERT INTO "NotificationTemplate" (
  id, key, name, description, kind, channel, audience, subject, body,
  "ctaLabel", "ctaUrlKey", "isActive", "updatedAt"
) VALUES (
  'sixfl-player-pool-final-chase-sms', 'player-pool-profile-final-chase-sms',
  'PlayerPool — second / final profile chase SMS',
  'Second and final automatic SMS, 48 hours after the first SMS was sent. Never sent after profile completion or when the player is paused, joined, no longer looking or opted out.',
  'TRANSACTIONAL', 'SMS', 'PLAYER', NULL,
  'Hi {{firstName}}, just a final reminder from SIXFL about your PlayerPool profile. If you''d still like us to help find you a team, please complete it here: {{profileUrl}} If you''re no longer looking, you can ignore this message.',
  NULL, NULL, TRUE, CURRENT_TIMESTAMP
) ON CONFLICT (key) DO NOTHING;
