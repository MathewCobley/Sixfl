-- CreateEnum safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'PlayerMatchFeeStatus'
  ) THEN
    CREATE TYPE "PlayerMatchFeeStatus" AS ENUM ('OPEN', 'PAID', 'WAIVED', 'CANCELLED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlayerMatchFee" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerMatchFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMatchFee_paymentToken_key" ON "PlayerMatchFee"("paymentToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlayerMatchFee_fixtureId_idx" ON "PlayerMatchFee"("fixtureId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlayerMatchFee_teamId_idx" ON "PlayerMatchFee"("teamId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlayerMatchFee_teamMemberId_idx" ON "PlayerMatchFee"("teamMemberId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlayerMatchFee_prospectId_idx" ON "PlayerMatchFee"("prospectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlayerMatchFee_status_idx" ON "PlayerMatchFee"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMatchFee_fixtureId_teamMemberId_key" ON "PlayerMatchFee"("fixtureId", "teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMatchFee_fixtureId_prospectId_key" ON "PlayerMatchFee"("fixtureId", "prospectId");

-- AddForeignKey safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlayerMatchFee_fixtureId_fkey'
  ) THEN
    ALTER TABLE "PlayerMatchFee"
    ADD CONSTRAINT "PlayerMatchFee_fixtureId_fkey"
    FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlayerMatchFee_teamId_fkey'
  ) THEN
    ALTER TABLE "PlayerMatchFee"
    ADD CONSTRAINT "PlayerMatchFee_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlayerMatchFee_teamMemberId_fkey'
  ) THEN
    ALTER TABLE "PlayerMatchFee"
    ADD CONSTRAINT "PlayerMatchFee_teamMemberId_fkey"
    FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlayerMatchFee_prospectId_fkey'
  ) THEN
    ALTER TABLE "PlayerMatchFee"
    ADD CONSTRAINT "PlayerMatchFee_prospectId_fkey"
    FOREIGN KEY ("prospectId") REFERENCES "TeamPlayerProspect"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
