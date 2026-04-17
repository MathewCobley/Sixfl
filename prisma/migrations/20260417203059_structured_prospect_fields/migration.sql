-- AlterTable
ALTER TABLE "FixtureAvailability" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FixtureSelection" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TeamPlayerProspect" ADD COLUMN     "ageBand" TEXT,
ADD COLUMN     "availabilityLevel" TEXT,
ADD COLUMN     "preferredNights" JSONB,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "TeamPlayerProspect_ageBand_idx" ON "TeamPlayerProspect"("ageBand");

-- CreateIndex
CREATE INDEX "TeamPlayerProspect_availabilityLevel_idx" ON "TeamPlayerProspect"("availabilityLevel");
