-- ========================================
-- Referee night cash distribution tracking
-- ========================================

ALTER TABLE "RefereeNight"
  ADD COLUMN "cashPaidToRefereePence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cashReceivedFromRefereePence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cashDistributionNotes" TEXT,
  ADD COLUMN "cashDistributedAt" TIMESTAMP(3),
  ADD COLUMN "cashDistributedByUserId" TEXT;

CREATE INDEX "RefereeNight_cashDistributedByUserId_idx"
  ON "RefereeNight" ("cashDistributedByUserId");

ALTER TABLE "RefereeNight"
  ADD CONSTRAINT "RefereeNight_cashDistributedByUserId_fkey"
  FOREIGN KEY ("cashDistributedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
