-- Reusable manual team-interest follow-up for any prospective league.
-- The sender personalises league/start information per lead and generates a
-- recipient-specific signed team / individual-player / no-longer-interested form.
INSERT INTO "EmailTemplate" (
  "id", "key", "name", "description", "audience", "interestType",
  "subject", "body", "ctaLabel", "ctaUrlKey", "isActive", "createdAt", "updatedAt"
) VALUES (
  'team-interest-still-joining',
  'team-interest-still-joining',
  'Team enquiry — still joining?',
  'Reusable manual follow-up for unconfirmed team enquiries in any SIXFL league. Uses each lead''s prospective league, start-date details and secure decision form, so the same template can be used for Rawdon, Thirsk, Catterick and future areas.',
  'LEAD',
  'TEAM',
  '{{leagueShortName}} — are you still looking to join SIXFL?',
  $body$Hi {{firstName}},

You registered an interest in joining SIXFL as a team, so I wanted to check whether you’d still like to be involved.

We’re now confirming teams for {{leagueName}}.

{{leagueStartLine}}

If you’d still like to enter a team, use the button below. It’s absolutely fine if you’re still getting your squad together or haven’t decided on a team name yet.

If you’d rather join as an individual player, choose the individual-player option on the same form and we’ll update your enquiry so we can help you find a team.

{{cta}}

If you’re no longer interested, you can let us know on the same form too.

Please let us know either way so we can finish organising the league. If you have any questions, just reply to this email.

Thanks,
Mathew$body$,
  'Choose team or individual player',
  'teamConfirmationUrl',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
