CREATE TABLE IF NOT EXISTS "PlayerDuplicateAttempt" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "attemptedByUserId" TEXT,
  "attemptedByEmail" TEXT,
  "displayName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "matchType" TEXT NOT NULL,
  "matchedRecordId" TEXT,
  "matchedTeamId" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerDuplicateAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerDuplicateAttempt_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerDuplicateAttempt_attemptedByUserId_fkey"
    FOREIGN KEY ("attemptedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PlayerDuplicateAttempt_matchedTeamId_fkey"
    FOREIGN KEY ("matchedTeamId") REFERENCES "Team"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PlayerDuplicateAttempt_teamId_createdAt_idx"
  ON "PlayerDuplicateAttempt"("teamId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "PlayerDuplicateAttempt_attemptedByUserId_createdAt_idx"
  ON "PlayerDuplicateAttempt"("attemptedByUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "PlayerDuplicateAttempt_matchType_createdAt_idx"
  ON "PlayerDuplicateAttempt"("matchType", "createdAt" DESC);
