-- ========================================
-- File: prisma/migrations/20260623150000_add_fixture_confirmation_late_fees/migration.sql
-- ========================================

CREATE TYPE "FixtureConfirmationLateFeeStatus" AS ENUM ('NONE', 'WARNING', 'APPLIED', 'WAIVED');

CREATE TABLE "FixtureConfirmationLateFee" (
  "id" TEXT NOT NULL,
  "fixtureId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "status" "FixtureConfirmationLateFeeStatus" NOT NULL DEFAULT 'NONE',
  "amountPence" INTEGER NOT NULL DEFAULT 1000,
  "note" TEXT,
  "warningAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "waivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FixtureConfirmationLateFee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FixtureConfirmationLateFee_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FixtureConfirmationLateFee_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FixtureConfirmationLateFee_fixtureId_teamId_key" ON "FixtureConfirmationLateFee"("fixtureId", "teamId");
CREATE INDEX "FixtureConfirmationLateFee_fixtureId_status_idx" ON "FixtureConfirmationLateFee"("fixtureId", "status");
CREATE INDEX "FixtureConfirmationLateFee_teamId_status_idx" ON "FixtureConfirmationLateFee"("teamId", "status");
CREATE INDEX "FixtureConfirmationLateFee_status_idx" ON "FixtureConfirmationLateFee"("status");
