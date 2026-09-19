-- Re-render existing active Goal of the Month nominees after the broadcast package changed.
-- Keep the current object key until the replacement render is safely stored; the worker
-- deletes the superseded object only after the new render becomes READY.
UPDATE "GoalOfMonthClipRender" r
SET
  "state"='QUEUED',
  "leaseToken"=NULL,
  "busyUntil"=NULL,
  "error"=NULL,
  "completedAt"=NULL,
  "updatedAt"=NOW()
FROM "GoalOfMonthCandidate" c
JOIN "SixflTvFootageAsset" a ON a."id"=c."clipAssetId"
WHERE c."id"=r."candidateId"
  AND c."status"='ACTIVE'
  AND c."clipAssetId" IS NOT NULL
  AND r."sourceAssetId"=c."clipAssetId"
  AND a."kind"='CLIP'
  AND a."state"='READY';
