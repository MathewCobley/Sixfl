-- Stop fixture placeholder teams (for example TBC) from inheriting or receiving
-- messages that belonged to a real team previously converted into a placeholder.

WITH placeholder_teams AS (
  SELECT "id"
  FROM "Team"
  WHERE COALESCE("isFixturePlaceholder", false) = true
)
UPDATE "NotificationPreference"
SET
  "emailEnabled" = false,
  "smsEnabled" = false,
  "urgentSmsEnabled" = false,
  "marketingEmailEnabled" = false,
  "marketingSmsEnabled" = false,
  "updatedAt" = NOW()
WHERE "recipientId" IN (
  SELECT nr."id"
  FROM "NotificationRecipient" nr
  JOIN placeholder_teams pt ON pt."id" = nr."sourceId"
  WHERE nr."sourceType" = 'TEAM'
);

WITH placeholder_teams AS (
  SELECT "id"
  FROM "Team"
  WHERE COALESCE("isFixturePlaceholder", false) = true
)
UPDATE "NotificationDispatch"
SET
  "status" = 'CANCELLED',
  "cancelledAt" = NOW(),
  "failureReason" = 'Fixture placeholder teams do not receive notifications.',
  "updatedAt" = NOW()
WHERE "recipientId" IN (
  SELECT nr."id"
  FROM "NotificationRecipient" nr
  JOIN placeholder_teams pt ON pt."id" = nr."sourceId"
  WHERE nr."sourceType" = 'TEAM'
)
  AND "status" IN ('QUEUED', 'PROCESSING');

WITH placeholder_teams AS (
  SELECT "id"
  FROM "Team"
  WHERE COALESCE("isFixturePlaceholder", false) = true
)
UPDATE "NotificationRecipient" nr
SET
  "displayName" = 'TBC placeholder',
  "email" = NULL,
  "phone" = NULL,
  "emailNormalized" = NULL,
  "phoneNormalized" = NULL,
  "marketingEmailOptIn" = false,
  "marketingSmsOptIn" = false,
  "transactionalEmailOptIn" = false,
  "transactionalSmsOptIn" = false,
  "isSuppressed" = true,
  "suppressionReason" = 'Fixture placeholder teams do not receive notifications.',
  "lastSyncedAt" = NOW(),
  "updatedAt" = NOW()
FROM placeholder_teams pt
WHERE nr."sourceType" = 'TEAM'
  AND nr."sourceId" = pt."id";

WITH placeholder_teams AS (
  SELECT "id"
  FROM "Team"
  WHERE COALESCE("isFixturePlaceholder", false) = true
)
UPDATE "MessageThread" mt
SET
  "teamId" = NULL,
  "status" = 'ARCHIVED',
  "unreadForAdminCount" = 0,
  "unreadForCaptainCount" = 0,
  "updatedAt" = NOW()
FROM placeholder_teams pt
WHERE mt."teamId" = pt."id";

DELETE FROM "TeamMember"
WHERE "teamId" IN (
  SELECT "id"
  FROM "Team"
  WHERE COALESCE("isFixturePlaceholder", false) = true
);

UPDATE "InterestLead"
SET
  "convertedTeamId" = NULL,
  "updatedAt" = NOW()
WHERE "convertedTeamId" IN (
  SELECT "id"
  FROM "Team"
  WHERE COALESCE("isFixturePlaceholder", false) = true
);

UPDATE "Team"
SET
  "claimCode" = CASE
    WHEN "claimCode" LIKE 'TBC-%' THEN "claimCode"
    ELSE 'TBC-' || UPPER(SUBSTRING(MD5("id") FROM 1 FOR 12))
  END,
  "contactName" = NULL,
  "contactEmail" = NULL,
  "contactPhone" = NULL,
  "secondaryContactName" = NULL,
  "secondaryContactEmail" = NULL,
  "secondaryContactPhone" = NULL,
  "createdByUserId" = NULL,
  "captainUserId" = NULL,
  "captainLinkedAt" = NULL,
  "captainLinkedSource" = NULL,
  "captainInviteSentAt" = NULL,
  "captainInviteSentTo" = NULL,
  "captainClaimedAt" = NULL,
  "captainClaimSource" = NULL,
  "updatedAt" = NOW()
WHERE COALESCE("isFixturePlaceholder", false) = true;
