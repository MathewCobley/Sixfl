-- CreateTable
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "PlayerInterestResponse" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "teamId" TEXT NOT NULL,
  "teamMemberId" TEXT,
  "prospectId" TEXT,
  "response" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlayerInterestResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerInterestResponse_tokenHash_key" ON "PlayerInterestResponse"("tokenHash");
CREATE INDEX IF NOT EXISTS "PlayerInterestResponse_teamId_idx" ON "PlayerInterestResponse"("teamId");
CREATE INDEX IF NOT EXISTS "PlayerInterestResponse_teamMemberId_idx" ON "PlayerInterestResponse"("teamMemberId");
CREATE INDEX IF NOT EXISTS "PlayerInterestResponse_prospectId_idx" ON "PlayerInterestResponse"("prospectId");
CREATE INDEX IF NOT EXISTS "PlayerInterestResponse_response_idx" ON "PlayerInterestResponse"("response");
CREATE INDEX IF NOT EXISTS "PlayerInterestResponse_respondedAt_idx" ON "PlayerInterestResponse"("respondedAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlayerInterestResponse_teamId_fkey'
  ) THEN
    ALTER TABLE "PlayerInterestResponse"
      ADD CONSTRAINT "PlayerInterestResponse_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlayerInterestResponse_teamMemberId_fkey'
  ) THEN
    ALTER TABLE "PlayerInterestResponse"
      ADD CONSTRAINT "PlayerInterestResponse_teamMemberId_fkey"
      FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlayerInterestResponse_prospectId_fkey'
  ) THEN
    ALTER TABLE "PlayerInterestResponse"
      ADD CONSTRAINT "PlayerInterestResponse_prospectId_fkey"
      FOREIGN KEY ("prospectId") REFERENCES "TeamPlayerProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
