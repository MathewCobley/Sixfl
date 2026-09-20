-- Re-render active Goal of the Month nominee videos after visual polish:
-- centred league text, restrained SIXFL green palette, compact replay tag,
-- and cleaner voting card without clock times.
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
