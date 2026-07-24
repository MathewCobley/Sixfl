-- ========================================
-- Migration: team shin pad warnings
-- ========================================

CREATE TABLE "TeamShinPadWarning" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "refereeNightId" TEXT,
  "reportedByUserId" TEXT,
  "notificationDispatchId" TEXT,
  "emailSentTo" TEXT,
  "emailQueuedAt" TIMESTAMP(3),
  "emailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamShinPadWarning_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TeamShinPadWarning"
  ADD CONSTRAINT "TeamShinPadWarning_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamShinPadWarning"
  ADD CONSTRAINT "TeamShinPadWarning_fixtureId_fkey"
  FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamShinPadWarning"
  ADD CONSTRAINT "TeamShinPadWarning_refereeNightId_fkey"
  FOREIGN KEY ("refereeNightId") REFERENCES "RefereeNight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamShinPadWarning"
  ADD CONSTRAINT "TeamShinPadWarning_reportedByUserId_fkey"
  FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamShinPadWarning"
  ADD CONSTRAINT "TeamShinPadWarning_notificationDispatchId_fkey"
  FOREIGN KEY ("notificationDispatchId") REFERENCES "NotificationDispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TeamShinPadWarning_fixtureId_teamId_key"
  ON "TeamShinPadWarning"("fixtureId", "teamId");
CREATE INDEX "TeamShinPadWarning_teamId_createdAt_idx"
  ON "TeamShinPadWarning"("teamId", "createdAt");
CREATE INDEX "TeamShinPadWarning_fixtureId_idx"
  ON "TeamShinPadWarning"("fixtureId");
CREATE INDEX "TeamShinPadWarning_refereeNightId_idx"
  ON "TeamShinPadWarning"("refereeNightId");
CREATE INDEX "TeamShinPadWarning_reportedByUserId_idx"
  ON "TeamShinPadWarning"("reportedByUserId");
CREATE INDEX "TeamShinPadWarning_notificationDispatchId_idx"
  ON "TeamShinPadWarning"("notificationDispatchId");
