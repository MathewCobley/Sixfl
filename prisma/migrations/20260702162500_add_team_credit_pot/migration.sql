-- CreateTable
CREATE TABLE "TeamCreditPotEntry" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fixtureId" TEXT,
    "chargeId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamCreditPotEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamCreditPotEntry_sourceType_sourceId_key" ON "TeamCreditPotEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "TeamCreditPotEntry_teamId_idx" ON "TeamCreditPotEntry"("teamId");

-- CreateIndex
CREATE INDEX "TeamCreditPotEntry_fixtureId_idx" ON "TeamCreditPotEntry"("fixtureId");

-- CreateIndex
CREATE INDEX "TeamCreditPotEntry_chargeId_idx" ON "TeamCreditPotEntry"("chargeId");

-- CreateIndex
CREATE INDEX "TeamCreditPotEntry_createdAt_idx" ON "TeamCreditPotEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "TeamCreditPotEntry" ADD CONSTRAINT "TeamCreditPotEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCreditPotEntry" ADD CONSTRAINT "TeamCreditPotEntry_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCreditPotEntry" ADD CONSTRAINT "TeamCreditPotEntry_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "PaymentCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
