-- Automatically build a branded Goal of the Month version of each nominated SIXFL TV clip.
-- Legacy goal-number nominations do not need media processing.

ALTER TABLE "GoalOfMonthCandidate"
  ADD COLUMN IF NOT EXISTS "mediaState" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "promoVideoObjectKey" TEXT,
  ADD COLUMN IF NOT EXISTS "promoVideoSizeBytes" BIGINT,
  ADD COLUMN IF NOT EXISTS "promoVideoDurationMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "mediaError" TEXT,
  ADD COLUMN IF NOT EXISTS "mediaQueuedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mediaStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mediaCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mediaBusyUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mediaLeaseToken" TEXT,
  ADD COLUMN IF NOT EXISTS "mediaAttempts" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GoalOfMonthCandidate_mediaState_check'
  ) THEN
    ALTER TABLE "GoalOfMonthCandidate"
      ADD CONSTRAINT "GoalOfMonthCandidate_mediaState_check"
      CHECK ("mediaState" IN ('NOT_REQUIRED','QUEUED','PROCESSING','READY','FAILED'));
  END IF;
END $$;

UPDATE "GoalOfMonthCandidate"
SET
  "mediaState" = 'QUEUED',
  "mediaQueuedAt" = COALESCE("mediaQueuedAt", NOW()),
  "mediaError" = NULL
WHERE "clipAssetId" IS NOT NULL
  AND "status" = 'ACTIVE'
  AND "mediaState" = 'NOT_REQUIRED';

CREATE INDEX IF NOT EXISTS "GoalOfMonthCandidate_media_queue_idx"
  ON "GoalOfMonthCandidate" ("mediaState", "mediaQueuedAt", "createdAt")
  WHERE "clipAssetId" IS NOT NULL AND "status" = 'ACTIVE';
