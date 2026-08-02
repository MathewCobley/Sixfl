-- Allow captains to assign each included kit slot to a squad member and
-- invite that player to complete their own shirt details.

CREATE TABLE IF NOT EXISTS "TeamKitPlayerAssignment" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  "backName" TEXT,
  "shirtNumber" INTEGER,
  "kitSize" TEXT,
  "sentAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastDispatchId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamKitPlayerAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamKitPlayerAssignment_position_check"
    CHECK ("position" BETWEEN 1 AND 7),
  CONSTRAINT "TeamKitPlayerAssignment_status_check"
    CHECK ("status" IN ('ASSIGNED', 'SENT', 'OPENED', 'COMPLETED')),
  CONSTRAINT "TeamKitPlayerAssignment_shirtNumber_check"
    CHECK ("shirtNumber" IS NULL OR "shirtNumber" BETWEEN 1 AND 99),
  CONSTRAINT "TeamKitPlayerAssignment_kitSize_check"
    CHECK ("kitSize" IS NULL OR "kitSize" IN ('S', 'M', 'L', 'XL', 'XXL')),
  CONSTRAINT "TeamKitPlayerAssignment_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamKitPlayerAssignment_teamMemberId_fkey"
    FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamKitPlayerAssignment_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamKitPlayerAssignment_token_key"
  ON "TeamKitPlayerAssignment"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamKitPlayerAssignment_teamId_position_key"
  ON "TeamKitPlayerAssignment"("teamId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamKitPlayerAssignment_teamId_teamMemberId_key"
  ON "TeamKitPlayerAssignment"("teamId", "teamMemberId");
CREATE INDEX IF NOT EXISTS "TeamKitPlayerAssignment_teamId_status_idx"
  ON "TeamKitPlayerAssignment"("teamId", "status");
CREATE INDEX IF NOT EXISTS "TeamKitPlayerAssignment_teamMemberId_idx"
  ON "TeamKitPlayerAssignment"("teamMemberId");
