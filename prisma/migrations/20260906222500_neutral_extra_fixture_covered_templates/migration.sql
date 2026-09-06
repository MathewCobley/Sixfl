-- Closure updates go to previously contacted teams, not just volunteers.
-- Do not rewrite sent/queued messages or reset existing administrator edits.
INSERT INTO "NotificationTemplate" (
  "id", "key", "name", "description", "kind", "channel", "audience",
  "subject", "body", "isActive", "createdAt", "updatedAt"
) VALUES (
  'sixfl_extra_fixture_covered_email_v1',
  'last-minute-extra-fixture-covered-email',
  'Extra fixture covered — team update',
  'Neutral closure email for contacted teams not selected for an extra fixture. Variables: firstName, teamName, kickoffTime, fixtureDate, replacementTeamName, opponentTeamName, leagueName, venueName, pitch.',
  'TRANSACTIONAL', 'EMAIL', 'TEAM',
  'SIXFL extra fixture now covered at {{kickoffTime}}',
  $body$Hi {{firstName}},

The extra fixture at {{kickoffTime}} has now been allocated to {{replacementTeamName}}.

{{teamName}} are not required for this extra game.

Date: {{fixtureDate}}
Kick-off: {{kickoffTime}}

This update is for information only — no reply is needed.

SIXFL$body$,
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
), (
  'sixfl_extra_fixture_covered_sms_v1',
  'last-minute-extra-fixture-covered-sms',
  'Extra fixture covered — team SMS update',
  'Neutral closure SMS for contacted teams not selected for an extra fixture. Variables: teamName, kickoffTime, fixtureDate, replacementTeamName, opponentTeamName.',
  'TRANSACTIONAL', 'SMS', 'TEAM', NULL,
  $body$SIXFL: The extra {{kickoffTime}} fixture has now been allocated to {{replacementTeamName}}. {{teamName}} are not required for this extra game. No reply is needed.$body$,
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
