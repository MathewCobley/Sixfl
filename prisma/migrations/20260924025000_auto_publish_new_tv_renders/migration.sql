-- Auto-publish new SIXFL TV renders, while permanently leaving older READY
-- previews untouched after the 24 Sep accidental-replacement incident.
--
-- This one-time cutover opts in only the fresh render batch created after
-- 02:25 Europe/London (01:25 UTC) on 24 Sep 2026. Older READY jobs keep their
-- existing false/missing flag and therefore cannot be picked up on worker restart.

UPDATE "SixflTvRenderJob" r
SET
  "metadataJson" =
    COALESCE(r."metadataJson", '{}'::jsonb)
    || '{"autoYoutubePublishRequested":true}'::jsonb,
  "updatedAt" = NOW()
WHERE r."kind" IN ('HIGHLIGHTS','FULL_MATCH')
  AND r."state" IN ('QUEUED','PROCESSING','READY')
  AND r."createdAt" >= TIMESTAMPTZ '2026-09-24 01:25:00+00'
  AND NOT EXISTS (
    SELECT 1
    FROM "SixflTvYoutubePublish" p
    WHERE p."renderJobId" = r."id"
  );
