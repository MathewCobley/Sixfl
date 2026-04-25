-- CreateEnum
CREATE TYPE "PlayerMatchFeeStatus" AS ENUM ('OPEN', 'PAID', 'WAIVED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "TeamMemberProfile" DROP CONSTRAINT "TeamMemberProfile_sourceProspectId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMemberProfile" DROP CONSTRAINT "TeamMemberProfile_teamMemberId_fkey";

-- DropTable
DROP TABLE "TeamMemberProfile";

-- CreateTable
CREATE TABLE "PlayerMatchFee" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamMemberId" TEXT,
    "prospectId" TEXT,
    "amountPence" INTEGER NOT NULL,
    "status" "PlayerMatchFeeStatus" NOT NULL DEFAULT 'OPEN',
    "paymentUrl" TEXT,
    "paymentToken" TEXT,
    "paidAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastChasedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerMatchFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatchFee_paymentToken_key" ON "PlayerMatchFee"("paymentToken");

-- CreateIndex
CREATE INDEX "PlayerMatchFee_fixtureId_idx" ON "PlayerMatchFee"("fixtureId");

-- CreateIndex
CREATE INDEX "PlayerMatchFee_teamId_idx" ON "PlayerMatchFee"("teamId");

-- CreateIndex
CREATE INDEX "PlayerMatchFee_teamMemberId_idx" ON "PlayerMatchFee"("teamMemberId");

-- CreateIndex
CREATE INDEX "PlayerMatchFee_prospectId_idx" ON "PlayerMatchFee"("prospectId");

-- CreateIndex
CREATE INDEX "PlayerMatchFee_status_idx" ON "PlayerMatchFee"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatchFee_fixtureId_teamMemberId_key" ON "PlayerMatchFee"("fixtureId", "teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatchFee_fixtureId_prospectId_key" ON "PlayerMatchFee"("fixtureId", "prospectId");

-- AddForeignKey
ALTER TABLE "PlayerMatchFee" ADD CONSTRAINT "PlayerMatchFee_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchFee" ADD CONSTRAINT "PlayerMatchFee_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchFee" ADD CONSTRAINT "PlayerMatchFee_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchFee" ADD CONSTRAINT "PlayerMatchFee_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "TeamPlayerProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
