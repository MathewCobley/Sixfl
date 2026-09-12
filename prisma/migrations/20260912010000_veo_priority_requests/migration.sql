-- Requesting Priority is not opting in and does not change fees or fixtures.
CREATE TABLE "VeoPriorityRequest" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
  "requestedBy" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'DECLINED')),
  "supplementPence" INTEGER NOT NULL DEFAULT 500 CHECK ("supplementPence" = 500),
  "termsVersion" TEXT NOT NULL,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  CHECK (("status" = 'PENDING' AND "reviewedAt" IS NULL) OR ("status" <> 'PENDING' AND "reviewedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "VeoPriorityRequest_one_pending" ON "VeoPriorityRequest" ("leagueId", "teamId") WHERE "status" = 'PENDING';
CREATE INDEX "VeoPriorityRequest_league_status_date" ON "VeoPriorityRequest" ("leagueId", "status", "requestedAt");
