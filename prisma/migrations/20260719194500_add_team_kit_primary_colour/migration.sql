ALTER TABLE "Team"
ADD COLUMN IF NOT EXISTS "kitPrimaryColour" TEXT;

UPDATE "Team" AS team
SET "kitPrimaryColour" = recipient."metadata" ->> 'kitPrimaryColour'
FROM "NotificationRecipient" AS recipient
WHERE recipient."sourceType" = 'TEAM'
  AND recipient."sourceId" = team."id"
  AND recipient."metadata" ->> 'kitPrimaryColour' ~ '^#[0-9A-Fa-f]{6}$'
  AND team."kitPrimaryColour" IS NULL;
