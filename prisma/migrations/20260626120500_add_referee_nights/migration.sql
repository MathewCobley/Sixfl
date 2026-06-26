-- ========================================
-- Referee nights: night-led referee assignments and cashups
-- ========================================

CREATE TABLE "RefereeNight" (
  "id" TEXT NOT NULL,
  "refereeId" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "venueId" TEXT,
  "nightDate" DATE NOT NULL,
  "feePence" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "cashCollectedPence" INTEGER NOT NULL DEFAULT 0,
  "retainedByRefereePence" INTEGER NOT NULL DEFAULT 0,
  "dueToSixflPence" INTEGER NOT NULL DEFAULT 0,
  "dueToRefereePence" INTEGER NOT NULL DEFAULT 0,
  "refereeNotes" TEXT,
  "adminNotes" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "approvedByUserId" TEXT,
  "settledByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RefereeNight_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefereeNight_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'SETTLED', 'REOPENED', 'CANCELLED'))
);

CREATE TABLE "RefereeNightFixture" (
  "id" TEXT NOT NULL,
  "refereeNightId" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RefereeNightFixture_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentTransaction"
  ADD COLUMN "collectedByUserId" TEXT,
  ADD COLUMN "refereeNightId" TEXT;

CREATE UNIQUE INDEX "RefereeNight_refereeId_leagueId_venueId_nightDate_key"
  ON "RefereeNight" ("refereeId", "leagueId", "venueId", "nightDate");

CREATE INDEX "RefereeNight_refereeId_nightDate_idx" ON "RefereeNight" ("refereeId", "nightDate");
CREATE INDEX "RefereeNight_leagueId_nightDate_idx" ON "RefereeNight" ("leagueId", "nightDate");
CREATE INDEX "RefereeNight_venueId_nightDate_idx" ON "RefereeNight" ("venueId", "nightDate");
CREATE INDEX "RefereeNight_status_idx" ON "RefereeNight" ("status");

CREATE UNIQUE INDEX "RefereeNightFixture_fixtureId_key" ON "RefereeNightFixture" ("fixtureId");
CREATE UNIQUE INDEX "RefereeNightFixture_refereeNightId_fixtureId_key" ON "RefereeNightFixture" ("refereeNightId", "fixtureId");
CREATE INDEX "RefereeNightFixture_refereeNightId_idx" ON "RefereeNightFixture" ("refereeNightId");

CREATE INDEX "PaymentTransaction_collectedByUserId_idx" ON "PaymentTransaction" ("collectedByUserId");
CREATE INDEX "PaymentTransaction_refereeNightId_idx" ON "PaymentTransaction" ("refereeNightId");

ALTER TABLE "RefereeNight"
  ADD CONSTRAINT "RefereeNight_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RefereeNight_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RefereeNight_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RefereeNight_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RefereeNight_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RefereeNight_settledByUserId_fkey" FOREIGN KEY ("settledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefereeNightFixture"
  ADD CONSTRAINT "RefereeNightFixture_refereeNightId_fkey" FOREIGN KEY ("refereeNightId") REFERENCES "RefereeNight"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RefereeNightFixture_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentTransaction"
  ADD CONSTRAINT "PaymentTransaction_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentTransaction_refereeNightId_fkey" FOREIGN KEY ("refereeNightId") REFERENCES "RefereeNight"("id") ON DELETE SET NULL ON UPDATE CASCADE;
