-- A stage is attempted once per prospect/team, regardless of channel or outcome.
CREATE UNIQUE INDEX IF NOT EXISTS "managed_registration_prospect_team_stage_key"
ON "NotificationDispatch" ("sourceId", (metadata->>'teamId'), (metadata->>'stage'))
WHERE "sourceType" = 'MANAGED_SQUAD_REGISTRATION_REMINDER';

-- Preserve administrator edits and disabled templates on reapplication.
INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","createdAt","updatedAt") VALUES
('managed-registration-reminder-sms','managed-squad-registration-reminder-sms','Managed squad registration reminder SMS','Automatic pending squad activation reminder; one channel per stage.','TRANSACTIONAL','SMS','PLAYER',NULL,
E'Hi {{firstName}}, please confirm your place with {{teamName}} using your SIXFL squad link: {{joinConfirmationUrl}}\nReply if you need help or no longer wish to join.',NULL,NULL,true,NOW(),NOW()),
('managed-registration-final-sms','managed-squad-registration-final-sms','Managed squad final registration SMS','Final automatic reminder; stops the sequence without removing the player.','TRANSACTIONAL','SMS','PLAYER',NULL,
E'Hi {{firstName}}, this is the last automatic reminder to confirm your place with {{teamName}}: {{joinConfirmationUrl}}\nReply if you need help or no longer wish to join.',NULL,NULL,true,NOW(),NOW()),
('managed-registration-reminder-email','managed-squad-registration-reminder-email','Managed squad registration reminder email','Automatic pending squad activation reminder or permitted SMS fallback.','TRANSACTIONAL','EMAIL','PLAYER','Your {{teamName}} squad registration',
E'Hi {{firstName}},\n\nYour squad activation for {{teamName}} is still waiting for confirmation.\n\n{{teamContextLine}}\n\nPlease use your personal squad link below to confirm your place.\n\n{{cta}}\n\nReply to this email if you need help or no longer wish to join.\n\nThanks,\nSIXFL','Confirm my squad place','joinConfirmationUrl',true,NOW(),NOW()),
('managed-registration-final-email','managed-squad-registration-final-email','Managed squad final registration email','Final automatic reminder or permitted SMS fallback; no automatic removal.','TRANSACTIONAL','EMAIL','PLAYER','Final registration reminder for {{teamName}}',
E'Hi {{firstName}},\n\nThis is the last automatic reminder to confirm your squad place with {{teamName}}.\n\n{{cta}}\n\nReply if you need help or no longer wish to join. We will not send further automatic registration reminders after this message.\n\nThanks,\nSIXFL','Confirm my squad place','joinConfirmationUrl',true,NOW(),NOW())
ON CONFLICT (key) DO NOTHING;
