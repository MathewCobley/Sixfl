-- Community-led Goal of the Week.
-- Players/captains nominate a goal by fixture + goal number. Duplicate
-- nominations are combined on one candidate. Verified users get one vote per
-- candidate week and may change that vote while voting is open.

CREATE TABLE "GoalOfWeekCandidate" (
  "id" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "weekOf" TIMESTAMP(3) NOT NULL,
  "goalNumber" INTEGER NOT NULL,
  "scorerName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalOfWeekCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoalOfWeekNomination" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalOfWeekNomination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoalOfWeekVote" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekOf" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalOfWeekVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoalOfWeekCandidate_fixtureId_goalNumber_key"
  ON "GoalOfWeekCandidate"("fixtureId", "goalNumber");
CREATE INDEX "GoalOfWeekCandidate_weekOf_status_idx"
  ON "GoalOfWeekCandidate"("weekOf", "status");
CREATE INDEX "GoalOfWeekCandidate_teamId_idx"
  ON "GoalOfWeekCandidate"("teamId");

CREATE UNIQUE INDEX "GoalOfWeekNomination_candidateId_userId_key"
  ON "GoalOfWeekNomination"("candidateId", "userId");
CREATE INDEX "GoalOfWeekNomination_candidateId_idx"
  ON "GoalOfWeekNomination"("candidateId");
CREATE INDEX "GoalOfWeekNomination_userId_idx"
  ON "GoalOfWeekNomination"("userId");

CREATE UNIQUE INDEX "GoalOfWeekVote_userId_weekOf_key"
  ON "GoalOfWeekVote"("userId", "weekOf");
CREATE INDEX "GoalOfWeekVote_candidateId_idx"
  ON "GoalOfWeekVote"("candidateId");
CREATE INDEX "GoalOfWeekVote_weekOf_idx"
  ON "GoalOfWeekVote"("weekOf");

ALTER TABLE "GoalOfWeekCandidate"
  ADD CONSTRAINT "GoalOfWeekCandidate_fixtureId_fkey"
  FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalOfWeekCandidate"
  ADD CONSTRAINT "GoalOfWeekCandidate_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoalOfWeekNomination"
  ADD CONSTRAINT "GoalOfWeekNomination_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "GoalOfWeekCandidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalOfWeekNomination"
  ADD CONSTRAINT "GoalOfWeekNomination_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalOfWeekVote"
  ADD CONSTRAINT "GoalOfWeekVote_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "GoalOfWeekCandidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalOfWeekVote"
  ADD CONSTRAINT "GoalOfWeekVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
