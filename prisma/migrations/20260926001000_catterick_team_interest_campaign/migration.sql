-- A manual campaign, deliberately NOT a System/NotificationTemplate.
-- Creating the template does not select recipients, send messages or alter leads.
-- Preserve any administrator edits when this migration is replayed.
INSERT INTO "EmailTemplate" (
  "id", "key", "name", "description", "audience", "interestType",
  "subject", "body", "ctaLabel", "ctaUrlKey", "isActive", "createdAt", "updatedAt"
) VALUES (
  'catterick-team-interest-october-2026',
  'catterick-team-interest-october-2026',
  'Catterick — still joining? (5 October)',
  'Manual follow-up for unconfirmed Catterick team enquiries. The secure decision form includes team, individual-player and no-longer-interested options. Start date supplied for the October 2026 launch; review before reusing.',
  'LEAD', 'TEAM',
  'Catterick starts 5 October — is your team joining us?',
  $body$Hi {{firstName}},

You registered an interest in joining SIXFL in Catterick as a team, so I wanted to check whether you’d still like to be part of it.

We’re putting the league together now, ready to start on Monday 5 October, and we’d love to have you involved.

Still looking to enter a team? Let us know using the button below. It’s fine if you’re still getting your squad together or haven’t decided on a team name yet.

Just looking to play yourself? Choose the individual-player option on the form and we’ll update your enquiry so we can help you find a team.

{{cta}}

If you’re no longer interested, you can let us know on the same form.

Please let us know either way so we can finish organising the league. Any questions, just reply to this email.

Thanks,
Mathew$body$,
  'Choose team or individual player',
  'teamConfirmationUrl',
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
