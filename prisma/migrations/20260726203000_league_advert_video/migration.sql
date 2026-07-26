-- Store private Railway bucket references for league advert videos.
-- The video bytes remain in object storage; PostgreSQL stores metadata only.

ALTER TABLE "League"
  ADD COLUMN IF NOT EXISTS "advertVideoKey" TEXT,
  ADD COLUMN IF NOT EXISTS "advertVideoFilename" TEXT,
  ADD COLUMN IF NOT EXISTS "advertVideoContentType" TEXT,
  ADD COLUMN IF NOT EXISTS "advertVideoSizeBytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "advertVideoEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "advertVideoUploadedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "League_advertVideoEnabled_idx"
  ON "League"("advertVideoEnabled");
