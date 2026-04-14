-- Create enums
DO $$
BEGIN
  CREATE TYPE "SocialPostType" AS ENUM ('NONE', 'RESULT', 'FIXTURE', 'UPDATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "SocialPostStatus" AS ENUM ('NONE', 'QUEUED', 'DRAFTED', 'APPROVED', 'PUBLISHED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Add fixture social fields
ALTER TABLE "Fixture"
  ADD COLUMN IF NOT EXISTS "socialPostType" "SocialPostType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "socialPostStatus" "SocialPostStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "socialCaption" TEXT,
  ADD COLUMN IF NOT EXISTS "socialImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "socialDraftExternalId" TEXT,
  ADD COLUMN IF NOT EXISTS "socialLastError" TEXT,
  ADD COLUMN IF NOT EXISTS "socialNeedsApproval" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "socialQueuedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "socialApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "socialPublishedAt" TIMESTAMP(3);

-- Add indexes
CREATE INDEX IF NOT EXISTS "Fixture_socialPostStatus_idx" ON "Fixture"("socialPostStatus");
CREATE INDEX IF NOT EXISTS "Fixture_socialPostType_idx" ON "Fixture"("socialPostType");