-- ========================================
-- Track template usage reliably from notification dispatches
-- ========================================
-- Safe production migration: no destructive changes.
-- This fixes templates showing "Never" when they have been used via the
-- communications/team messaging flows where the selected template is stored
-- in NotificationDispatch.metadata.

ALTER TABLE "EmailTemplate"
ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);

ALTER TABLE "NotificationTemplate"
ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "EmailTemplate_lastUsedAt_idx"
ON "EmailTemplate"("lastUsedAt");

CREATE INDEX IF NOT EXISTS "NotificationTemplate_lastUsedAt_idx"
ON "NotificationTemplate"("lastUsedAt");

-- Backfill campaign EmailTemplate usage from historic dispatch metadata.
UPDATE "EmailTemplate" template
SET "lastUsedAt" = GREATEST(
  COALESCE(template."lastUsedAt", TIMESTAMP '1970-01-01'),
  usage."lastUsedAt"
)
FROM (
  SELECT
    email_template."id",
    MAX(COALESCE(dispatch."sentAt", dispatch."processedAt", dispatch."createdAt")) AS "lastUsedAt"
  FROM "EmailTemplate" email_template
  JOIN "NotificationDispatch" dispatch
    ON (
      dispatch."metadata"->>'templateId' = email_template."id"
      OR dispatch."metadata"->>'templateKey' = email_template."key"
    )
  WHERE dispatch."status" IN ('QUEUED', 'PROCESSING', 'SENT')
  GROUP BY email_template."id"
) usage
WHERE template."id" = usage."id";

-- Backfill NotificationTemplate usage from both direct templateId links and metadata.
UPDATE "NotificationTemplate" template
SET "lastUsedAt" = GREATEST(
  COALESCE(template."lastUsedAt", TIMESTAMP '1970-01-01'),
  usage."lastUsedAt"
)
FROM (
  SELECT
    notification_template."id",
    MAX(COALESCE(dispatch."sentAt", dispatch."processedAt", dispatch."createdAt")) AS "lastUsedAt"
  FROM "NotificationTemplate" notification_template
  JOIN "NotificationDispatch" dispatch
    ON (
      dispatch."templateId" = notification_template."id"
      OR dispatch."metadata"->>'templateId' = notification_template."id"
      OR dispatch."metadata"->>'templateKey' = notification_template."key"
    )
  WHERE dispatch."status" IN ('QUEUED', 'PROCESSING', 'SENT')
  GROUP BY notification_template."id"
) usage
WHERE template."id" = usage."id";

CREATE OR REPLACE FUNCTION sixfl_touch_template_last_used_from_dispatch()
RETURNS trigger AS $$
DECLARE
  used_at TIMESTAMP(3);
  metadata_template_id TEXT;
  metadata_template_key TEXT;
BEGIN
  IF NEW."status" NOT IN ('QUEUED', 'PROCESSING', 'SENT') THEN
    RETURN NEW;
  END IF;

  used_at := COALESCE(NEW."sentAt", NEW."processedAt", NEW."createdAt", now());
  metadata_template_id := NEW."metadata"->>'templateId';
  metadata_template_key := NEW."metadata"->>'templateKey';

  IF NEW."templateId" IS NOT NULL THEN
    UPDATE "NotificationTemplate"
    SET "lastUsedAt" = GREATEST(COALESCE("lastUsedAt", TIMESTAMP '1970-01-01'), used_at)
    WHERE "id" = NEW."templateId";
  END IF;

  IF metadata_template_id IS NOT NULL AND metadata_template_id <> '' THEN
    UPDATE "EmailTemplate"
    SET "lastUsedAt" = GREATEST(COALESCE("lastUsedAt", TIMESTAMP '1970-01-01'), used_at)
    WHERE "id" = metadata_template_id;

    UPDATE "NotificationTemplate"
    SET "lastUsedAt" = GREATEST(COALESCE("lastUsedAt", TIMESTAMP '1970-01-01'), used_at)
    WHERE "id" = metadata_template_id;
  END IF;

  IF metadata_template_key IS NOT NULL AND metadata_template_key <> '' THEN
    UPDATE "EmailTemplate"
    SET "lastUsedAt" = GREATEST(COALESCE("lastUsedAt", TIMESTAMP '1970-01-01'), used_at)
    WHERE "key" = metadata_template_key;

    UPDATE "NotificationTemplate"
    SET "lastUsedAt" = GREATEST(COALESCE("lastUsedAt", TIMESTAMP '1970-01-01'), used_at)
    WHERE "key" = metadata_template_key;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "NotificationDispatch_template_last_used_trigger" ON "NotificationDispatch";

CREATE TRIGGER "NotificationDispatch_template_last_used_trigger"
AFTER INSERT OR UPDATE OF "status", "sentAt", "processedAt", "metadata", "templateId"
ON "NotificationDispatch"
FOR EACH ROW
EXECUTE FUNCTION sixfl_touch_template_last_used_from_dispatch();
