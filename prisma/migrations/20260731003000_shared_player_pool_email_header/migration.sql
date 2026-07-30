-- Ensure every PlayerPool email selects the shared PlayerPool email header.
-- The renderer removes this marker from the visible message body.

UPDATE "NotificationTemplate"
SET
  "body" = CASE
    WHEN "body" LIKE '%{{emailBrand:player-pool}}%' THEN "body"
    ELSE '{{emailBrand:player-pool}}' || E'\n\n' || "body"
  END,
  "updatedAt" = NOW()
WHERE "key" = 'player-pool-profile-invite-email';

UPDATE "EmailTemplate"
SET
  "body" = CASE
    WHEN "body" LIKE '%{{emailBrand:player-pool}}%' THEN "body"
    ELSE '{{emailBrand:player-pool}}' || E'\n\n' || "body"
  END,
  "updatedAt" = NOW()
WHERE "key" = 'managed-squad-player-pool-opportunity';
