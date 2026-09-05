-- Permission is deliberately separate from attendance, permanent membership and money.
CREATE TABLE "FixtureGuestApproval" (
  "id" TEXT PRIMARY KEY,
  "fixtureId" TEXT NOT NULL REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "playerUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL CHECK ("status" IN ('APPROVED', 'REVOKED')),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "approvedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "approvedByName" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "revokedByName" TEXT,
  "revocationReason" TEXT,
  UNIQUE ("fixtureId", "teamId", "playerUserId")
);
CREATE INDEX "FixtureGuestApproval_team_fixture_status_idx"
  ON "FixtureGuestApproval" ("teamId", "fixtureId", "status");
CREATE TABLE "FixtureGuestApprovalEvent" (
  "id" TEXT PRIMARY KEY,
  "approvalId" TEXT NOT NULL REFERENCES "FixtureGuestApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "decision" TEXT NOT NULL CHECK ("decision" IN ('APPROVED', 'REVOKED')),
  "revision" INTEGER NOT NULL,
  "actorUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "actorName" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("approvalId", "revision")
);
