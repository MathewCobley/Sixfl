-- CreateEnum
CREATE TYPE "ResultDisputeType" AS ENUM ('SCORE', 'PLAYER', 'GENERAL');

-- CreateEnum
CREATE TYPE "ResultDisputeStatus" AS ENUM ('OPEN', 'REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ResultDispute" (
    "id" TEXT NOT NULL,
    "matchResultId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "ResultDisputeType" NOT NULL,
    "status" "ResultDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "adminNote" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultDispute_matchResultId_idx" ON "ResultDispute"("matchResultId");

-- CreateIndex
CREATE INDEX "ResultDispute_teamId_idx" ON "ResultDispute"("teamId");

-- CreateIndex
CREATE INDEX "ResultDispute_status_idx" ON "ResultDispute"("status");

-- CreateIndex
CREATE INDEX "ResultDispute_createdByUserId_idx" ON "ResultDispute"("createdByUserId");

-- AddForeignKey
ALTER TABLE "ResultDispute" ADD CONSTRAINT "ResultDispute_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultDispute" ADD CONSTRAINT "ResultDispute_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultDispute" ADD CONSTRAINT "ResultDispute_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
