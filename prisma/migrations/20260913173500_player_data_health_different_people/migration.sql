CREATE TABLE IF NOT EXISTS "PlayerDataHealthExclusion" (
  "id" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerDataHealthExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerDataHealthExclusion_record_user_key"
ON "PlayerDataHealthExclusion"("recordType", "recordId", "userId");

CREATE INDEX IF NOT EXISTS "PlayerDataHealthExclusion_record_idx"
ON "PlayerDataHealthExclusion"("recordType", "recordId");
