CREATE TYPE "FixtureCaptainConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ISSUE_RAISED');

CREATE TABLE "FixtureCaptainConfirmation" (
  "id" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "status" "FixtureCaptainConfirmationStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "issueRaisedAt" TIMESTAMP(3),
  "lastChasedAt" TIMESTAMP(3),
  "confirmedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FixtureCaptainConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixtureCaptainConfirmation_fixtureId_teamId_key"
ON "FixtureCaptainConfirmation"("fixtureId", "teamId");

CREATE INDEX "FixtureCaptainConfirmation_fixtureId_status_idx"
ON "FixtureCaptainConfirmation"("fixtureId", "status");

CREATE INDEX "FixtureCaptainConfirmation_teamId_status_idx"
ON "FixtureCaptainConfirmation"("teamId", "status");

CREATE INDEX "FixtureCaptainConfirmation_confirmedByUserId_idx"
ON "FixtureCaptainConfirmation"("confirmedByUserId");

CREATE INDEX "FixtureCaptainConfirmation_lastChasedAt_idx"
ON "FixtureCaptainConfirmation"("lastChasedAt");

ALTER TABLE "FixtureCaptainConfirmation"
ADD CONSTRAINT "FixtureCaptainConfirmation_fixtureId_fkey"
FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixtureCaptainConfirmation"
ADD CONSTRAINT "FixtureCaptainConfirmation_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixtureCaptainConfirmation"
ADD CONSTRAINT "FixtureCaptainConfirmation_confirmedByUserId_fkey"
FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;