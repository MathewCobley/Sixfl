-- Add editable System SMS templates for automatic team-lead decision reminders.
-- Existing administrator wording is preserved on later deployments.

INSERT INTO "NotificationTemplate" (
  "id",
  "key",
  "name",
  "description",
  "kind",
  "channel",
  "audience",
  "subject",
  "body",
  "ctaLabel",
  "ctaUrlKey",
  "isActive",
  "createdAt",
  "updatedAt"
) VALUES
  (
    'tpl_team_lead_confirmation_sms_nudge',
    'team-lead-confirmation-sms-nudge',
    'Team lead decision SMS reminder',
    'First automatic SMS sent when a team lead has not replied to a SIXFL decision email after 48 hours.',
    'TRANSACTIONAL'::"NotificationTemplateKind",
    'SMS'::"NotificationChannel",
    'LEAD'::"NotificationAudience",
    NULL,
    'Hi {{firstName}}, just checking you saw our email about {{leagueName}}. We still need your yes or no team decision. Please use this link: {{teamConfirmationUrl}}. No payment is due now and there is no long-term contract.',
    NULL,
    NULL,
    true,
    NOW(),
    NOW()
  ),
  (
    'tpl_team_lead_confirmation_sms_final_nudge',
    'team-lead-confirmation-sms-final-nudge',
    'Team lead final decision SMS reminder',
    'Final automatic SMS sent when a team lead still has not replied five days after the first SMS reminder.',
    'TRANSACTIONAL'::"NotificationTemplateKind",
    'SMS'::"NotificationChannel",
    'LEAD'::"NotificationAudience",
    NULL,
    'Hi {{firstName}}, this is our final automatic reminder about your SIXFL {{leagueName}} enquiry. Please tell us whether you want to enter a team: {{teamConfirmationUrl}}. Choose No if not, so we can update our list and stop chasing you.',
    NULL,
    NULL,
    true,
    NOW(),
    NOW()
  )
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "kind" = EXCLUDED."kind",
  "channel" = EXCLUDED."channel",
  "audience" = EXCLUDED."audience",
  "isActive" = true,
  "updatedAt" = NOW();

-- Cron runs can overlap during a deployment or retry. This guarantees that each
-- lead receives no more than one first reminder and one final reminder.
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDispatch_team_lead_sms_nudge_once"
  ON "NotificationDispatch" ("sourceType", "sourceId")
  WHERE "sourceType" IN (
    'LEAD_TEAM_CONFIRMATION_SMS_NUDGE_1',
    'LEAD_TEAM_CONFIRMATION_SMS_NUDGE_FINAL'
  )
    AND "status" <> 'CANCELLED'::"NotificationDispatchStatus";
