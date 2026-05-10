-- Track when reusable templates are successfully used.
-- Safe production migration: nullable columns only, no destructive changes.

ALTER TABLE "EmailTemplate"
ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);

ALTER TABLE "NotificationTemplate"
ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "EmailTemplate_lastUsedAt_idx"
ON "EmailTemplate"("lastUsedAt");

CREATE INDEX IF NOT EXISTS "NotificationTemplate_lastUsedAt_idx"
ON "NotificationTemplate"("lastUsedAt");
