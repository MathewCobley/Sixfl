-- Additive render queue for branded Goal of the Month nominee clips.
-- Source clips remain unchanged. Rendered nominee videos live in private object storage.
CREATE TABLE IF NOT EXISTS "GoalOfMonthClipRender" (
  "candidateId" TEXT PRIMARY KEY REFERENCES "GoalOfMonthCandidate"("id") ON DELETE CASCADE,
  "sourceAssetId" TEXT NOT NULL REFERENCES "SixflTvFootageAsset"("id") ON DELETE RESTRICT,
  "state" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("state" IN ('QUEUED','PROCESSING','READY','FAILED')),
  "objectKey" TEXT,
  "sizeBytes" BIGINT,
  "durationMs" INTEGER,
  "leaseToken" TEXT,
  "busyUntil" TIMESTAMPTZ,
  "error" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  CHECK (
    ("state" = 'READY' AND "objectKey" IS NOT NULL AND "sizeBytes" IS NOT NULL AND "durationMs" IS NOT NULL)
    OR "state" <> 'READY'
  )
);
CREATE INDEX IF NOT EXISTS "GoalOfMonthClipRender_state_created"
  ON "GoalOfMonthClipRender" ("state","createdAt");
