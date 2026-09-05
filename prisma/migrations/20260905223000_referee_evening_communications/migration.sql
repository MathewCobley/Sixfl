-- One communication identity per referee / London calendar evening, independent
-- of the financial RefereeNight grouping. Do not use cashup updatedAt as a timer.
CREATE TABLE "RefereeEveningNotice" (
  "id" TEXT PRIMARY KEY,
  "refereeId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "nightDate" DATE NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "summaryHash" TEXT,
  "confirmationStatus" TEXT NOT NULL DEFAULT 'PENDING'
    CHECK ("confirmationStatus" IN ('PENDING', 'CONFIRMED', 'DECLINED')),
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("refereeId", "nightDate")
);
CREATE INDEX "RefereeEveningNotice_nightDate_idx" ON "RefereeEveningNotice" ("nightDate");
CREATE TABLE "RefereeEveningToken" (
  "hash" TEXT PRIMARY KEY,
  "eveningId" TEXT NOT NULL REFERENCES "RefereeEveningNotice"("id") ON DELETE CASCADE,
  "summaryHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3)
);
CREATE INDEX "RefereeEveningToken_evening_idx" ON "RefereeEveningToken" ("eveningId");
-- A second line of defence alongside the transactional per-evening lock.
CREATE UNIQUE INDEX "NotificationDispatch_referee_evening_once_idx"
  ON "NotificationDispatch" ("sourceId", "channel", (metadata->>'messageKind'), (metadata->>'generation'))
  WHERE "sourceType" = 'REFEREE_EVENING_V1' AND status <> 'CANCELLED';

CREATE FUNCTION sixfl_touch_referee_evening(ref_id TEXT, night_date DATE)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF ref_id IS NULL OR night_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London')::date THEN RETURN; END IF;
  INSERT INTO "RefereeEveningNotice" ("id", "refereeId", "nightDate")
  VALUES (md5(ref_id || ':' || night_date::text), ref_id, night_date)
  ON CONFLICT ("refereeId", "nightDate") DO UPDATE
    SET "changedAt" = CURRENT_TIMESTAMP, "generation" = "RefereeEveningNotice"."generation" + 1;
END;
$$;

-- Database capture covers every admin, API, generation, backfill, move, delete
-- and bulk-assignment path, even when post-save notification code fails.
CREATE FUNCTION sixfl_fixture_evening_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
    ROW(OLD."refereeId", OLD."kickoffAt", OLD."venueId", OLD."leagueId", OLD."publishedAt" IS NOT NULL, OLD.status IN ('SCHEDULED','COMPLETED'))
    IS NOT DISTINCT FROM
    ROW(NEW."refereeId", NEW."kickoffAt", NEW."venueId", NEW."leagueId", NEW."publishedAt" IS NOT NULL, NEW.status IN ('SCHEDULED','COMPLETED'))
  THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' AND OLD."publishedAt" IS NOT NULL THEN
    PERFORM sixfl_touch_referee_evening(OLD."refereeId", (OLD."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."publishedAt" IS NOT NULL THEN
    PERFORM sixfl_touch_referee_evening(NEW."refereeId", (NEW."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "Fixture_referee_evening_changed"
  AFTER INSERT OR UPDATE OR DELETE ON "Fixture"
  FOR EACH ROW EXECUTE FUNCTION sixfl_fixture_evening_changed();

CREATE FUNCTION sixfl_evening_settings_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  IF TG_TABLE_NAME = 'League' THEN
    IF OLD."minutesPerGame" IS NOT DISTINCT FROM NEW."minutesPerGame" THEN RETURN NULL; END IF;
    FOR r IN SELECT DISTINCT "refereeId", ("kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date AS day
      FROM "Fixture" WHERE "leagueId" = NEW.id AND "publishedAt" IS NOT NULL AND "refereeId" IS NOT NULL
    LOOP PERFORM sixfl_touch_referee_evening(r."refereeId", r.day); END LOOP;
  ELSIF TG_TABLE_NAME = 'Venue' THEN
    IF ROW(OLD.name, OLD.address, OLD.postcode) IS NOT DISTINCT FROM ROW(NEW.name, NEW.address, NEW.postcode) THEN RETURN NULL; END IF;
    FOR r IN SELECT DISTINCT "refereeId", ("kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date AS day
      FROM "Fixture" WHERE "venueId" = NEW.id AND "publishedAt" IS NOT NULL AND "refereeId" IS NOT NULL
    LOOP PERFORM sixfl_touch_referee_evening(r."refereeId", r.day); END LOOP;
  ELSIF TG_TABLE_NAME = 'RefereeNight' THEN
    IF (OLD.status = 'CANCELLED') IS NOT DISTINCT FROM (NEW.status = 'CANCELLED') THEN RETURN NULL; END IF;
    PERFORM sixfl_touch_referee_evening(NEW."refereeId", NEW."nightDate");
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "League_referee_evening_duration" AFTER UPDATE ON "League"
  FOR EACH ROW EXECUTE FUNCTION sixfl_evening_settings_changed();
CREATE TRIGGER "Venue_referee_evening_location" AFTER UPDATE ON "Venue"
  FOR EACH ROW EXECUTE FUNCTION sixfl_evening_settings_changed();
CREATE TRIGGER "RefereeNight_evening_cancelled" AFTER UPDATE ON "RefereeNight"
  FOR EACH ROW EXECUTE FUNCTION sixfl_evening_settings_changed();

-- Existing future assignments receive a settling period from deployment, not a
-- burst of historic messages. Completed/past evenings are never backfilled.
INSERT INTO "RefereeEveningNotice" ("id", "refereeId", "nightDate")
SELECT DISTINCT md5(f."refereeId" || ':' || (f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date::text),
  f."refereeId", (f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date
FROM "Fixture" f
WHERE f."publishedAt" IS NOT NULL AND f."refereeId" IS NOT NULL
  AND f.status = 'SCHEDULED' AND f."kickoffAt" > CURRENT_TIMESTAMP
ON CONFLICT ("refereeId", "nightDate") DO NOTHING;

-- Cancel only superseded unsent automation. Sent / in-flight messages and
-- personal conversations, availability requests and finance notices are retained.
UPDATE "NotificationDispatch"
SET status = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP,
    "failureReason" = 'Replaced by the consolidated referee evening booking and single SMS reminder.'
WHERE status IN ('QUEUED', 'FAILED') AND "sourceType" IN (
  'FIXTURE_NIGHT_BOARD_REFEREE_NOTICE', 'REFEREE_ASSIGNMENT_BACKFILL',
  'REFEREE_NIGHT_BOOKED', 'REFEREE_NIGHT_REMINDER_24H',
  'REFEREE_NIGHT_CONFIRMATION_AUTO72H', 'REFEREE_NIGHT_CONFIRMATION_AUTO24H', 'REFEREE_NIGHT_CONFIRMATION_MANUAL'
);
UPDATE "NotificationTemplate" SET "isActive" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
WHERE key IN ('referee-night-booked-email', 'referee-night-reminder-24h-email');

-- Editable System Templates. No update clause: preserve administrator edits.
INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-schedule-email', 'referee-evening-schedule-email', 'Referee evening — email schedule row', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'EMAIL', 'REFEREE', NULL, '{{venueName}}
{{venueAddress}}
Please arrive by: {{arriveAt}}
First kick-off: {{firstKickoff}}
Last kick-off: {{lastKickoff}}
Expected finish: {{finishAt}}', NULL, NULL, TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-schedule-sms', 'referee-evening-schedule-sms', 'Referee evening — SMS schedule row', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'SMS', 'REFEREE', NULL, '{{venueName}}: arrive {{arriveAt}}, last kick-off {{lastKickoff}}, finish {{finishAt}}.', NULL, NULL, TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-booking-email', 'referee-evening-booking-email', 'Referee evening — booking email', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'EMAIL', 'REFEREE', 'Your SIXFL referee booking — {{nightLabel}}', 'Hi {{firstName}},

You are booked to referee for SIXFL on {{nightLabel}}.

{{schedule}}

Please confirm whether you can attend: {{confirmationUrl}}

Individual match details stay on your referee dashboard: {{dashboardUrl}}

{{cta}}', 'Confirm attendance', 'confirmationUrl', TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-booking-confirmed-email', 'referee-evening-booking-confirmed-email', 'Referee evening — confirmed booking email', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'EMAIL', 'REFEREE', 'Your SIXFL referee booking — {{nightLabel}}', 'Hi {{firstName}},

Your attendance on {{nightLabel}} is confirmed. Here are your times for the evening.

{{schedule}}

Individual match details: {{dashboardUrl}}

{{cta}}', 'Open referee dashboard', 'dashboardUrl', TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-update-email', 'referee-evening-update-email', 'Referee evening — changed hours or venue', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'EMAIL', 'REFEREE', 'Updated SIXFL referee booking — {{nightLabel}}', 'Hi {{firstName}},

Your referee booking for {{nightLabel}} has changed. These times and venues replace the previous booking.

{{schedule}}

Please confirm you can attend the updated booking: {{confirmationUrl}}

Dashboard: {{dashboardUrl}}

{{cta}}', 'Confirm updated booking', 'confirmationUrl', TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-cancelled-email', 'referee-evening-cancelled-email', 'Referee evening — cancellation email', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'EMAIL', 'REFEREE', 'SIXFL referee booking cancelled — {{nightLabel}}', 'Hi {{firstName}},

Your SIXFL referee booking for {{nightLabel}} has been cancelled. You are no longer required for this evening.

Previous booking:
{{previousSchedule}}

Dashboard: {{dashboardUrl}}

{{cta}}', 'Open referee dashboard', 'dashboardUrl', TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-reminder-sms', 'referee-evening-reminder-sms', 'Referee evening — confirmed reminder SMS', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'SMS', 'REFEREE', NULL, 'Your SIXFL referee reminder for {{nightLabel}}. {{schedule}} Dashboard: {{dashboardUrl}}', NULL, NULL, TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-confirmation-sms', 'referee-evening-confirmation-sms', 'Referee evening — attendance reminder SMS', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'SMS', 'REFEREE', NULL, 'Please confirm your SIXFL referee booking for {{nightLabel}}. {{schedule}} Confirm here: {{confirmationUrl}}', NULL, NULL, TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-update-sms', 'referee-evening-update-sms', 'Referee evening — urgent changed hours or venue', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'SMS', 'REFEREE', NULL, 'IMPORTANT: your SIXFL referee booking for {{nightLabel}} has changed. {{schedule}} Confirm updated booking: {{confirmationUrl}}', NULL, NULL, TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

INSERT INTO "NotificationTemplate" (id,key,name,description,kind,channel,audience,subject,body,"ctaLabel","ctaUrlKey","isActive","updatedAt") VALUES (
'sixfl-referee-evening-cancelled-sms', 'referee-evening-cancelled-sms', 'Referee evening — urgent cancellation SMS', 'Consolidated referee evening communications. Schedule rows are reusable content, not separate messages.', 'TRANSACTIONAL', 'SMS', 'REFEREE', NULL, 'IMPORTANT: your SIXFL referee booking for {{nightLabel}} has been cancelled. You are no longer required this evening. Dashboard: {{dashboardUrl}}', NULL, NULL, TRUE, CURRENT_TIMESTAMP) ON CONFLICT (key) DO NOTHING;

