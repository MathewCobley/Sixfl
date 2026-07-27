-- Replace the initial short PlayerPool invitation with a fuller explanation of
-- how PlayerPool works, what teams can see and how introductions are handled.

UPDATE "NotificationTemplate"
SET
  "subject" = 'Find a SIXFL team with PlayerPool',
  "body" = 'Hi {{firstName}},

Thanks for registering your interest in playing 6-a-side with SIXFL.

We have added you to SIXFL PlayerPool, which helps individual players connect with local teams that are looking to strengthen their squad.

To join the pool, please complete a short profile telling us:

- your age group;
- your preferred positions;
- your football experience;
- the evenings and areas that suit you;
- how regularly you are available to play.

Teams can then view your football profile and decide whether they may be a suitable match.

Your name, email address and mobile number are not shown to teams. If a team would like to speak to you, they must request an introduction through SIXFL. Your contact details are not shared simply because you complete the form.

Completing a profile does not commit you to joining any team, attending a trial or accepting an introduction.

{{cta}}

We hope PlayerPool helps you find the right team and get playing.',
  "ctaLabel" = 'Complete my PlayerPool profile',
  "ctaUrlKey" = 'profileUrl',
  "updatedAt" = NOW()
WHERE "key" = 'player-pool-profile-invite-email';