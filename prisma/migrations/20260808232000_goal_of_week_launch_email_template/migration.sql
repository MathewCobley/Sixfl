-- ========================================
-- Migration: editable Goal of the Week launch email template
-- ========================================

INSERT INTO "EmailTemplate" (
  "id",
  "key",
  "name",
  "description",
  "audience",
  "interestType",
  "subject",
  "body",
  "ctaLabel",
  "ctaUrlKey",
  "isActive",
  "createdAt",
  "updatedAt"
) VALUES (
  'goal-of-week-player-vote-launch',
  'goal-of-week-player-vote-launch',
  'Goal of the Week — player voting launch',
  'System-wide announcement introducing player nominations and the weekly Goal of the Week vote. Edit this in Admin → Templates, then send it from Communications → Announcements.',
  'PLAYER',
  'PLAYER',
  'Goal of the Week is now yours to decide ⚽',
  $body$Hi {{firstName}},

SIXFL Goal of the Week is changing — the players now choose it.

After a recorded SIXFL TV match, players and captains can nominate the goals they think deserve to be in the running. If more than one person picks the same goal, those nominations are combined.

The six most-nominated goals go into the following week's ballot. Every verified SIXFL player and captain gets one vote, and you can change your choice until voting closes.

You will now see a Goal of the Week card on your SIXFL dashboard whenever there is something to nominate or a vote is open.

{{cta}}

So if somebody scores an absolute worldie, don't just talk about it — nominate it. And when the shortlist opens, you decide the winner.$body$,
  'Open my SIXFL dashboard',
  'captainDashboardUrl',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
