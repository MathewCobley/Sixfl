-- Manual no-fixture capacity email used from the Night Board.
-- Preserve any administrator-edited version if this template already exists.

INSERT INTO "NotificationTemplate" (
  "id",
  "key",
  "name",
  "description",
  "kind",
  "channel",
  "audience",
  "subject",
  "body",
  "ctaLabel",
  "ctaUrlKey",
  "isActive",
  "createdAt",
  "updatedAt"
) VALUES (
  'team-no-fixture-capacity-email',
  'team-no-fixture-capacity-email',
  'Team no fixture this week — capacity',
  'Manual transactional email for an active team that is available but cannot be allocated a fixture because the league has more teams than available pitch slots.',
  'TRANSACTIONAL',
  'EMAIL',
  'TEAM',
  'SIXFL fixture update — no fixture this week',
  E'Hi {{firstName}},\n\nJust a quick update about this week’s fixtures.\n\nUnfortunately, we haven’t been able to allocate {{teamName}} a fixture this week. As the league has grown, we currently have more teams wanting to play than the number of pitch slots available on the night.\n\nWe’re really sorry about this. We know the whole point of joining SIXFL is to play regularly, and we don’t want missing a week to become a regular occurrence.\n\nTeams do occasionally have to drop out of fixtures, so if a slot becomes available this week, we’ll contact you straight away and offer it to you.\n\nWe’re also looking at organising additional playing capacity / another night to relieve the pressure as the league continues to grow.\n\nMost importantly, we will make sure {{teamName}} has a fixture next week.\n\nThanks for your patience and for being part of SIXFL. The growth of the league is really positive, but we appreciate that it is frustrating when that means we can’t accommodate everybody on a particular week.\n\nBest wishes,\nThe SIXFL Team',
  NULL,
  NULL,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
