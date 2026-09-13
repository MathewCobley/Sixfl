-- Additive, opt-in cup workflow. Do not change existing cups, entrants or messages.
CREATE TABLE "CupInvitationSettings" (
  "cupLeagueId" TEXT PRIMARY KEY REFERENCES "League"("id") ON DELETE CASCADE,
  "matchFeePence" INTEGER NOT NULL CHECK ("matchFeePence" >= 0 AND "matchFeePence" <= 100000),
  "venueNote" TEXT NOT NULL,
  "scheduleNote" TEXT NOT NULL,
  "responseDeadline" TIMESTAMPTZ NOT NULL,
  "state" TEXT NOT NULL CHECK ("state" IN ('DRAFT','OPEN','CLOSED')),
  "version" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "termsHash" TEXT NOT NULL,
  "updatedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE "CupInvitation" (
  "id" TEXT PRIMARY KEY,
  "cupLeagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
  "settingsVersion" INTEGER NOT NULL,
  "terms" JSONB NOT NULL,
  "response" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("response" IN ('PENDING','YES','NO')),
  "responseVersion" INTEGER NOT NULL DEFAULT 0,
  "respondedAt" TIMESTAMPTZ,
  "respondedByName" TEXT,
  "respondedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "lastReminderAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("cupLeagueId", "teamId")
);
CREATE TABLE "CupInvitationMessage" (
  "id" TEXT PRIMARY KEY,
  "invitationId" TEXT NOT NULL REFERENCES "CupInvitation"("id") ON DELETE CASCADE,
  "settingsVersion" INTEGER NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('INITIAL','REMINDER')),
  "batch" INTEGER NOT NULL DEFAULT 0,
  "recipientId" TEXT NOT NULL REFERENCES "NotificationRecipient"("id") ON DELETE RESTRICT,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "dispatchId" TEXT UNIQUE REFERENCES "NotificationDispatch"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("invitationId", "settingsVersion", "kind", "batch", "recipientEmail")
);
CREATE TABLE "CupInvitationAudit" (
  "id" TEXT PRIMARY KEY,
  "cupLeagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "teamId" TEXT REFERENCES "Team"("id") ON DELETE SET NULL,
  "actorUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "actorName" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "CupInvitation_team_idx" ON "CupInvitation"("teamId");
CREATE INDEX "CupInvitationAudit_cup_idx" ON "CupInvitationAudit"("cupLeagueId", "createdAt");
CREATE UNIQUE INDEX "NotificationDispatch_cup_message_once" ON "NotificationDispatch"("sourceType", "sourceId")
  WHERE "sourceType" IN ('CUP_INTEREST_INVITATION','CUP_INTEREST_REMINDER');

INSERT INTO "NotificationTemplate" ("id","key","name","description","kind","channel","audience","subject","body","isActive","createdAt","updatedAt") VALUES
('cup-interest-invitation','cup-interest-invitation','Cup interest invitation','Two editable response buttons. Opening a link does not save a response.','TRANSACTIONAL','EMAIL','TEAM',
'🏆 {{teamName}} — are you up for {{cupName}}?',
$body$Hi {{firstName}},

Fancy a cup run?

We're inviting {{teamName}} to express an interest in {{cupName}} — a {{cupFormat}} competition bringing together teams from different SIXFL leagues.

Win your tie and progress to the next round, with a place in the final as the goal. It's a chance to face different opposition and represent your league.

Cost: {{matchFee}} per team per match.
Locations: {{venueNote}}
Match nights and dates: {{scheduleNote}}

Please have a quick chat with your squad and let us know by {{responseDeadline}}.

SIXFL_POLL_OPTIONS_START
Yes — our team is interested: {{yesUrl}}
No — not this time: {{noUrl}}
SIXFL_POLL_OPTIONS_END

At this stage, a Yes registers your interest, not a final entry or a payment. We'll confirm the final arrangements with interested teams before finalising entries and making the draw.

Please respond either way so we know where your team stands.

Thanks,
Mathew$body$,true,NOW(),NOW()),
('cup-interest-reminder','cup-interest-reminder','Cup interest reminder','Sent only to teams still awaiting a response.','TRANSACTIONAL','EMAIL','TEAM',
'{{teamName}} — a quick reminder about {{cupName}}',
$body$Hi {{firstName}},

We're still waiting to hear whether {{teamName}} would be interested in {{cupName}}, our {{cupFormat}} competition.

Cost: {{matchFee}} per team per match.
Locations: {{venueNote}}
Match nights and dates: {{scheduleNote}}

Please let us know either way by {{responseDeadline}}.

SIXFL_POLL_OPTIONS_START
Yes — our team is interested: {{yesUrl}}
No — not this time: {{noUrl}}
SIXFL_POLL_OPTIONS_END

A Yes registers interest only. We'll agree the final arrangements before confirming entries. No payment is taken by responding.

Thanks,
Mathew$body$,true,NOW(),NOW())
ON CONFLICT ("key") DO NOTHING;
