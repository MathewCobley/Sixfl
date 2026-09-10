-- Restore the reminderIntro context lost from the automated fee sender.
-- These are editable content fragments, not independently scheduled messages.
-- Keep all existing administrator edits and disabled states, including reruns.
INSERT INTO "NotificationTemplate"
  ("id", "key", "name", "description", "kind", "channel", "audience", "subject", "body", "ctaLabel", "ctaUrlKey", "isActive", "createdAt", "updatedAt")
VALUES
  ('match-fee-reminder-intro-email-first', 'match-fee-reminder-intro-email-first', 'Match fee reminder introduction - first email',
   'Editable reminderIntro fragment for the first automated match-fee email reminder. Not sent independently.',
   'TRANSACTIONAL', 'EMAIL', 'TEAM', NULL,
   'Your match fee for the fixture below is still unpaid.', NULL, NULL, true, NOW(), NOW()),
  ('match-fee-reminder-intro-email-follow-up', 'match-fee-reminder-intro-email-follow-up', 'Match fee reminder introduction - follow-up email',
   'Editable reminderIntro fragment for the follow-up automated match-fee email reminder. Not sent independently.',
   'TRANSACTIONAL', 'EMAIL', 'TEAM', NULL,
   'Your match fee for the fixture below remains outstanding.', NULL, NULL, true, NOW(), NOW()),
  ('match-fee-reminder-intro-sms-first', 'match-fee-reminder-intro-sms-first', 'Match fee reminder introduction - first SMS',
   'Editable reminderIntro fragment for the first automated match-fee SMS reminder. Not sent independently.',
   'TRANSACTIONAL', 'SMS', 'TEAM', NULL,
   'Your match fee is still unpaid.', NULL, NULL, true, NOW(), NOW()),
  ('match-fee-reminder-intro-sms-follow-up', 'match-fee-reminder-intro-sms-follow-up', 'Match fee reminder introduction - follow-up SMS',
   'Editable reminderIntro fragment for the follow-up automated match-fee SMS reminder. Not sent independently.',
   'TRANSACTIONAL', 'SMS', 'TEAM', NULL,
   'Your match fee remains outstanding.', NULL, NULL, true, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
