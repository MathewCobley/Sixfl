DO $$
BEGIN
  CREATE TYPE "KitFundLedgerEntryType" AS ENUM ('FUND_ADDED', 'FUND_USED', 'FUND_RESTORED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "KitFundLedgerEntry" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "entryType" "KitFundLedgerEntryType" NOT NULL,
  "amountPence" INTEGER NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "chargeId" TEXT,
  "description" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KitFundLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KitFundLedgerEntry_amountPence_positive" CHECK ("amountPence" > 0)
);

DO $$
BEGIN
  ALTER TABLE "KitFundLedgerEntry"
    ADD CONSTRAINT "KitFundLedgerEntry_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "KitFundLedgerEntry"
    ADD CONSTRAINT "KitFundLedgerEntry_chargeId_fkey"
    FOREIGN KEY ("chargeId") REFERENCES "PaymentCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "KitFundLedgerEntry"
    ADD CONSTRAINT "KitFundLedgerEntry_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "KitFundLedgerEntry_teamId_createdAt_idx"
  ON "KitFundLedgerEntry"("teamId", "createdAt");

CREATE INDEX IF NOT EXISTS "KitFundLedgerEntry_chargeId_idx"
  ON "KitFundLedgerEntry"("chargeId");

CREATE INDEX IF NOT EXISTS "KitFundLedgerEntry_entryType_idx"
  ON "KitFundLedgerEntry"("entryType");

CREATE UNIQUE INDEX IF NOT EXISTS "KitFundLedgerEntry_source_unique"
  ON "KitFundLedgerEntry"("sourceType", "sourceId", "entryType")
  WHERE "sourceId" IS NOT NULL;
