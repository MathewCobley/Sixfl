-- Heartlands was an early regional marketing concept. Catterick and Thirsk now
-- have their own customer-facing league identities, so keep the old records for
-- history and existing relations but remove them from all active league flows.
UPDATE "League"
SET
  "isActive" = FALSE,
  "homepageStage" = 'HIDDEN',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE LOWER(COALESCE("name", '')) LIKE '%heartlands%'
   OR LOWER(COALESCE("slug", '')) LIKE '%heartlands%';
