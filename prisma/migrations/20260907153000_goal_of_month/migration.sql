-- Additive monthly competition. All weekly award records and votes stay intact.
CREATE TABLE IF NOT EXISTS "GoalOfMonthCandidate" (
  "id" TEXT PRIMARY KEY,
  "fixtureId" TEXT NOT NULL REFERENCES "Fixture"("id") ON DELETE CASCADE,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
  "monthKey" TEXT NOT NULL CHECK ("monthKey" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  "goalNumber" INTEGER NOT NULL CHECK ("goalNumber" > 0),
  "scorerName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'REMOVED')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("fixtureId", "goalNumber")
);
CREATE INDEX IF NOT EXISTS "GoalOfMonthCandidate_month_status_idx" ON "GoalOfMonthCandidate"("monthKey", "status");

CREATE TABLE IF NOT EXISTS "GoalOfMonthNomination" (
  "id" TEXT PRIMARY KEY,
  "candidateId" TEXT NOT NULL REFERENCES "GoalOfMonthCandidate"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("candidateId", "userId")
);
CREATE INDEX IF NOT EXISTS "GoalOfMonthNomination_user_idx" ON "GoalOfMonthNomination"("userId");

CREATE TABLE IF NOT EXISTS "GoalOfMonthVote" (
  "id" TEXT PRIMARY KEY,
  "candidateId" TEXT NOT NULL REFERENCES "GoalOfMonthCandidate"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "monthKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "monthKey")
);
CREATE INDEX IF NOT EXISTS "GoalOfMonthVote_candidate_idx" ON "GoalOfMonthVote"("candidateId");

CREATE TABLE IF NOT EXISTS "GoalAwardTransition" (
  "id" TEXT PRIMARY KEY CHECK ("id" = 'monthly'),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstMonth" TEXT NOT NULL,
  "weeklyNominationsCloseAt" TIMESTAMP(3) NOT NULL,
  "weeklyVotingClosesAt" TIMESTAMP(3) NOT NULL
);
-- Finish the current weekly round on its original timetable. Replay must never
-- reopen a weekly round or move the monthly launch date.
INSERT INTO "GoalAwardTransition" (
  "id", "firstMonth", "weeklyNominationsCloseAt", "weeklyVotingClosesAt"
) VALUES (
  'monthly', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London', 'YYYY-MM'),
  ((date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') + INTERVAL '7 days') AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC',
  ((date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London') + INTERVAL '8 days 18 hours') AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC'
) ON CONFLICT ("id") DO NOTHING;
