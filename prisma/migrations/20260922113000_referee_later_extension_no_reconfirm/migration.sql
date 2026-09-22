-- A confirmed referee does not need to reconfirm when the same evening is only
-- extended later at the same venue. These templates are information-only
-- notices for that safe extension case.

INSERT INTO "NotificationTemplate" (
  id,key,name,description,kind,channel,audience,subject,body,
  "ctaLabel","ctaUrlKey","isActive","updatedAt"
) VALUES (
  'sixfl-referee-evening-update-confirmed-email',
  'referee-evening-update-confirmed-email',
  'Referee evening — confirmed later finish update',
  'Information-only update when an already-confirmed referee evening is extended later without changing the original start or venues.',
  'TRANSACTIONAL',
  'EMAIL',
  'REFEREE',
  'Update to your SIXFL referee evening — {{nightLabel}}',
  'Hi {{firstName}},

Your referee evening on {{nightLabel}} now runs later than when you confirmed.

Your existing attendance confirmation still stands — you do not need to confirm again.

Updated times:
{{schedule}}

If the later finish causes a problem, please contact SIXFL.

Dashboard: {{dashboardUrl}}

{{cta}}',
  'Open referee dashboard',
  'dashboardUrl',
  TRUE,
  CURRENT_TIMESTAMP
) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (
  id,key,name,description,kind,channel,audience,subject,body,
  "ctaLabel","ctaUrlKey","isActive","updatedAt"
) VALUES (
  'sixfl-referee-evening-update-confirmed-sms',
  'referee-evening-update-confirmed-sms',
  'Referee evening — confirmed later finish SMS',
  'Urgent information-only update when an already-confirmed referee evening is extended later without changing the original start or venues.',
  'TRANSACTIONAL',
  'SMS',
  'REFEREE',
  NULL,
  'Update: your SIXFL referee evening for {{nightLabel}} now runs later. Your existing confirmation still stands — no need to reconfirm. {{schedule}} If this causes a problem, contact SIXFL. Dashboard: {{dashboardUrl}}',
  NULL,
  NULL,
  TRUE,
  CURRENT_TIMESTAMP
) ON CONFLICT (key) DO NOTHING;
