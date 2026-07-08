CREATE TYPE "TeamCreditLedgerEntryType" AS ENUM ('CREDIT_ADDED', 'CREDIT_USED', 'CREDIT_REVERSED');

CREATE TABLE "TeamCreditLedgerEntry" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "fixtureId" TEXT,
  "sourceFixtureId" TEXT,
  "chargeId" TEXT,
  "entryType" "TeamCreditLedgerEntryType" NOT NULL,
  "amountPence" INTEGER NOT NULL,
  "description" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamCreditLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamCreditLedgerEntry_amountPence_positive" CHECK ("amountPence" > 0)
);

ALTER TABLE "TeamCreditLedgerEntry"
  ADD CONSTRAINT "TeamCreditLedgerEntry_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamCreditLedgerEntry"
  ADD CONSTRAINT "TeamCreditLedgerEntry_fixtureId_fkey"
  FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamCreditLedgerEntry"
  ADD CONSTRAINT "TeamCreditLedgerEntry_sourceFixtureId_fkey"
  FOREIGN KEY ("sourceFixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamCreditLedgerEntry"
  ADD CONSTRAINT "TeamCreditLedgerEntry_chargeId_fkey"
  FOREIGN KEY ("chargeId") REFERENCES "PaymentCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamCreditLedgerEntry"
  ADD CONSTRAINT "TeamCreditLedgerEntry_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TeamCreditLedgerEntry_teamId_createdAt_idx"
  ON "TeamCreditLedgerEntry"("teamId", "createdAt");

CREATE INDEX "TeamCreditLedgerEntry_chargeId_idx"
  ON "TeamCreditLedgerEntry"("chargeId");

CREATE INDEX "TeamCreditLedgerEntry_fixtureId_idx"
  ON "TeamCreditLedgerEntry"("fixtureId");

CREATE INDEX "TeamCreditLedgerEntry_sourceFixtureId_idx"
  ON "TeamCreditLedgerEntry"("sourceFixtureId");

CREATE INDEX "TeamCreditLedgerEntry_entryType_idx"
  ON "TeamCreditLedgerEntry"("entryType");

CREATE UNIQUE INDEX "TeamCreditLedgerEntry_credit_used_chargeId_key"
  ON "TeamCreditLedgerEntry"("chargeId")
  WHERE "entryType" = 'CREDIT_USED' AND "chargeId" IS NOT NULL;
