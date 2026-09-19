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

-- Existing active clip nominees should receive the same branded treatment without
-- asking players to nominate again.
INSERT INTO "GoalOfMonthClipRender" ("candidateId","sourceAssetId")
SELECT c."id", c."clipAssetId"
FROM "GoalOfMonthCandidate" c
JOIN "SixflTvFootageAsset" a ON a."id"=c."clipAssetId"
WHERE c."status"='ACTIVE'
  AND c."clipAssetId" IS NOT NULL
  AND a."kind"='CLIP'
  AND a."state"='READY'
ON CONFLICT ("candidateId") DO NOTHING;
