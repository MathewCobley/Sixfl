-- Make the reusable squad activation template team-agnostic.
-- The captain prospect page supplies the current managed team's name when the
-- template is selected, and the send action also resolves {{teamName}} from the
-- prospect's actual team.

UPDATE "EmailTemplate"
SET
  "subject" = 'You''ve been added to the {{teamName}} squad',
  "body" = E'Hi {{firstName}},\n\nYou''ve been added to the {{teamName}} squad.\n\nPlease complete your squad signup using this email address so we can activate your player profile and keep you updated with fixtures, team messages and league information.\n\nActivate your squad place here:\n\n{{cta}}\n\nThanks,\nSIXFL',
  "updatedAt" = NOW()
WHERE "key" = 'squad-activation-email';

-- Keep the notification-template copy dynamic too, including databases where
-- an older edited version had a specific managed squad written into it.
UPDATE "NotificationTemplate"
SET
  "subject" = 'You''ve been added to the {{teamName}} squad',
  "body" = E'Hi {{firstName}},\n\nYou''ve been added to the {{teamName}} squad.\n\nPlease complete your squad signup using this email address so we can activate your player profile and keep you updated with fixtures, team messages and league information.\n\nActivate your squad place here:\n\n{{cta}}\n\nThanks,\nSIXFL',
  "updatedAt" = NOW()
WHERE "key" = 'squad-activation-email';
