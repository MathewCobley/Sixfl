-- CreateEnum
CREATE TYPE "PaymentChargeStatus" AS ENUM ('OPEN', 'PART_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "PaymentCharge" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "leagueId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amountPence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "PaymentChargeStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "chargeId" TEXT,
    "amountPence" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentCharge_teamId_idx" ON "PaymentCharge"("teamId");

-- CreateIndex
CREATE INDEX "PaymentCharge_leagueId_idx" ON "PaymentCharge"("leagueId");

-- CreateIndex
CREATE INDEX "PaymentCharge_status_idx" ON "PaymentCharge"("status");

-- CreateIndex
CREATE INDEX "PaymentCharge_dueDate_idx" ON "PaymentCharge"("dueDate");

-- CreateIndex
CREATE INDEX "PaymentTransaction_teamId_idx" ON "PaymentTransaction"("teamId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_chargeId_idx" ON "PaymentTransaction"("chargeId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_paidAt_idx" ON "PaymentTransaction"("paidAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_method_idx" ON "PaymentTransaction"("method");

-- AddForeignKey
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "PaymentCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
