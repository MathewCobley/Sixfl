-- Prevent concurrent/repeated submissions from queueing the same saved
-- announcement revision more than once for the same notification recipient.
-- Failed/skipped/cancelled attempts remain retryable because they are outside
-- the partial unique index.

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDispatch_announcement_recipient_once"
ON "NotificationDispatch" ("recipientId", "sourceType", "sourceId")
WHERE "sourceType" = 'ANNOUNCEMENT'
  AND "status" IN ('QUEUED', 'PROCESSING', 'SENT');
