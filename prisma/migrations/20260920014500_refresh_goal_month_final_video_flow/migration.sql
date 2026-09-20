-- Re-render active Goal of the Month nominee clips after the final flow update:
-- polished title card, fixed replay overlay, full-speed ending and voting card.
-- Existing rendered objects remain available until the worker safely replaces them.
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
  AND r."state" IN ('READY','FAILED')
  AND a."kind"='CLIP'
  AND a."state"='READY';
