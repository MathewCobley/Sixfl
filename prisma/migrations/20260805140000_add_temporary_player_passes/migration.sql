-- Player-controlled, one-time temporary-player sharing passes.

CREATE TABLE IF NOT EXISTS "TemporaryPlayerPass" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  "playerMatchFeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TemporaryPlayerPass_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TemporaryPlayerPass_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TemporaryPlayerPass_fixtureId_fkey"
    FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TemporaryPlayerPass_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TemporaryPlayerPass_acceptedByUserId_fkey"
    FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TemporaryPlayerPass_playerMatchFeeId_fkey"
    FOREIGN KEY ("playerMatchFeeId") REFERENCES "PlayerMatchFee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TemporaryPlayerPass_status_check"
    CHECK ("status" IN ('OPEN', 'ACCEPTED', 'REVOKED', 'EXPIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "TemporaryPlayerPass_code_key"
  ON "TemporaryPlayerPass"("code");
CREATE INDEX IF NOT EXISTS "TemporaryPlayerPass_userId_createdAt_idx"
  ON "TemporaryPlayerPass"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TemporaryPlayerPass_fixtureId_teamId_status_idx"
  ON "TemporaryPlayerPass"("fixtureId", "teamId", "status");
CREATE INDEX IF NOT EXISTS "TemporaryPlayerPass_expiresAt_status_idx"
  ON "TemporaryPlayerPass"("expiresAt", "status");
