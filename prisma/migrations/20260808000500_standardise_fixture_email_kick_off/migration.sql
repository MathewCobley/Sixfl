-- Standardise UK football wording in existing fixture-related email templates.
-- Keep template variable names such as {{kickoffLabel}} unchanged.

UPDATE "NotificationTemplate"
SET "body" = REPLACE("body", 'New kickoff:', 'New kick-off:')
WHERE "key" = 'fixture-change-email';

UPDATE "NotificationTemplate"
SET "body" = REPLACE("body", 'before kickoff.', 'before kick-off.')
WHERE "key" = 'fixture-publish-digest-email';

UPDATE "NotificationTemplate"
SET "body" = REPLACE(
  REPLACE("body", 'Kickoff: {{kickoffLabel}}', 'Kick-off: {{kickoffLabel}}'),
  'ready for kickoff.',
  'ready for kick-off.'
)
WHERE "key" = 'fixture-reminder-email';

UPDATE "NotificationTemplate"
SET "body" = REPLACE(
  REPLACE("body", 'Kickoff: {{kickoffLabel}}', 'Kick-off: {{kickoffLabel}}'),
  'after kickoff.',
  'after kick-off.'
)
WHERE "key" = 'match-fee-due-email';

UPDATE "NotificationTemplate"
SET "body" = REPLACE("body", 'Kickoff: {{kickoffLabel}}', 'Kick-off: {{kickoffLabel}}')
WHERE "key" = 'match-fee-reminder-email';
