-- ========================================
-- Migration: show template source in message history subjects
-- ========================================
--
-- Message history views already show the MessageEntry subject everywhere.
-- This makes the template source visible consistently by prefixing outbound
-- email history subjects when the message entry is linked to a notification
-- dispatch that used a NotificationTemplate.
--
-- This does not change the email that was sent to the recipient; it only
-- annotates the saved admin-facing message history record.

CREATE OR REPLACE FUNCTION "sixflApplyTemplateSubjectPrefix"()
RETURNS trigger AS $$
DECLARE
  template_label TEXT;
  current_subject TEXT;
BEGIN
  IF NEW."notificationDispatchId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."direction"::text <> 'OUTBOUND' OR NEW."channel"::text <> 'EMAIL' THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(NULLIF(nt."name", ''), NULLIF(nt."key", ''))
  INTO template_label
  FROM "NotificationDispatch" nd
  LEFT JOIN "NotificationTemplate" nt
    ON nt."id" = nd."templateId"
  WHERE nd."id" = NEW."notificationDispatchId"
  LIMIT 1;

  IF template_label IS NULL OR template_label = '' THEN
    RETURN NEW;
  END IF;

  current_subject := COALESCE(NULLIF(NEW."subject", ''), 'Email');

  IF current_subject LIKE 'Template:% · %' THEN
    RETURN NEW;
  END IF;

  NEW."subject" := 'Template: ' || template_label || ' · ' || current_subject;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "MessageEntry_template_subject_prefix" ON "MessageEntry";

CREATE TRIGGER "MessageEntry_template_subject_prefix"
BEFORE INSERT OR UPDATE OF "notificationDispatchId", "subject", "direction", "channel"
ON "MessageEntry"
FOR EACH ROW
EXECUTE FUNCTION "sixflApplyTemplateSubjectPrefix"();

UPDATE "MessageEntry" me
SET "subject" = 'Template: ' || template_label || ' · ' || COALESCE(NULLIF(me."subject", ''), 'Email')
FROM (
  SELECT
    nd."id" AS dispatch_id,
    COALESCE(NULLIF(nt."name", ''), NULLIF(nt."key", '')) AS template_label
  FROM "NotificationDispatch" nd
  LEFT JOIN "NotificationTemplate" nt
    ON nt."id" = nd."templateId"
) source
WHERE me."notificationDispatchId" = source.dispatch_id
  AND me."direction"::text = 'OUTBOUND'
  AND me."channel"::text = 'EMAIL'
  AND source.template_label IS NOT NULL
  AND source.template_label <> ''
  AND COALESCE(me."subject", '') NOT LIKE 'Template:% · %';
