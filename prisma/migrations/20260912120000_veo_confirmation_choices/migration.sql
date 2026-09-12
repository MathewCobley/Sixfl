-- New confirmations choose Veo after publication. No league is enabled and no
-- historical allocation, price, customer preference or receipt is rewritten.
ALTER TABLE "VeoLeagueSettings" ADD COLUMN "confirmationMode" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "VeoMatchChoice" (
  "fixtureId" TEXT NOT NULL REFERENCES "Fixture"(id) ON DELETE CASCADE,
  "teamId" TEXT NOT NULL REFERENCES "Team"(id) ON DELETE CASCADE,
  "leagueId" TEXT NOT NULL REFERENCES "League"(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK (choice IN ('NONE','MATCH','ONGOING')),
  "fixtureStamp" TEXT NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "agreedPence" INTEGER NOT NULL CHECK ("agreedPence" IN (0,500)),
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("fixtureId","teamId")
);
CREATE INDEX "VeoMatchChoice_league" ON "VeoMatchChoice" ("leagueId");
CREATE TABLE "VeoCameraNight" (
  id TEXT PRIMARY KEY,
  "venueId" TEXT NOT NULL REFERENCES "Venue"(id),
  pitch TEXT NOT NULL,
  "matchDate" TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 12),
  "finalisedBy" TEXT NOT NULL,
  "finalisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("venueId", pitch, "matchDate")
);
CREATE TABLE "VeoMatchDecision" (
  "fixtureId" TEXT PRIMARY KEY REFERENCES "Fixture"(id),
  "nightId" TEXT NOT NULL REFERENCES "VeoCameraNight"(id),
  "leagueId" TEXT NOT NULL REFERENCES "League"(id),
  "homeTeamId" TEXT NOT NULL REFERENCES "Team"(id),
  "awayTeamId" TEXT NOT NULL REFERENCES "Team"(id),
  "kickoffAt" TIMESTAMP(3) NOT NULL,
  "venueId" TEXT NOT NULL,
  "originalPitch" TEXT,
  pitch TEXT,
  allocated BOOLEAN NOT NULL,
  "homeRequested" BOOLEAN NOT NULL,
  "awayRequested" BOOLEAN NOT NULL,
  "homeBasePence" INTEGER NOT NULL CHECK ("homeBasePence" >= 0),
  "awayBasePence" INTEGER NOT NULL CHECK ("awayBasePence" >= 0),
  "homeExtraPence" INTEGER NOT NULL CHECK ("homeExtraPence" IN (0,500)),
  "awayExtraPence" INTEGER NOT NULL CHECK ("awayExtraPence" IN (0,500)),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  CHECK (allocated OR ("homeExtraPence"=0 AND "awayExtraPence"=0))
);
CREATE INDEX "VeoMatchDecision_night" ON "VeoMatchDecision" ("nightId");
CREATE TABLE "VeoMatchAddon" (
  "chargeId" TEXT PRIMARY KEY REFERENCES "PaymentCharge"(id),
  "fixtureId" TEXT NOT NULL REFERENCES "VeoMatchDecision"("fixtureId"),
  "teamId" TEXT NOT NULL REFERENCES "Team"(id),
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  UNIQUE ("fixtureId","teamId")
);
-- Reversals retain the original £5 charge and all genuine receipts. Credit uses
-- actual net payments, including returned team credit, never the nominal fee or
-- an unpaid waiver. The deterministic credit identity prevents duplicate credit.
CREATE FUNCTION sixfl_sync_cancelled_veo_credit(p_charge TEXT) RETURNS void AS $$
DECLARE a "VeoMatchAddon"%ROWTYPE; paid INTEGER;
BEGIN
  SELECT * INTO a FROM "VeoMatchAddon" WHERE "chargeId"=p_charge AND "cancelledAt" IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM id FROM "PaymentCharge" WHERE id=p_charge FOR UPDATE;
  SELECT GREATEST(COALESCE(SUM("amountPence"),0),0)::integer INTO paid
    FROM "PaymentTransaction" WHERE "chargeId"=p_charge;
  UPDATE "PaymentCharge" SET status='VOID', "updatedAt"=CURRENT_TIMESTAMP WHERE id=p_charge AND status<>'VOID';
  IF paid>0 THEN
    INSERT INTO "TeamCreditLedgerEntry" (id,"teamId","sourceFixtureId","chargeId","entryType","amountPence",description)
    VALUES ('tcred_veo_refund_'||p_charge,a."teamId",a."fixtureId",p_charge,'CREDIT_ADDED',paid,'Veo recording unavailable: paid add-on returned as team credit.')
    ON CONFLICT (id) DO UPDATE SET "amountPence"=EXCLUDED."amountPence";
  ELSE
    DELETE FROM "TeamCreditLedgerEntry" WHERE id='tcred_veo_refund_'||p_charge;
  END IF;
  UPDATE "NotificationDispatch" SET status='CANCELLED', "failureReason"='Veo add-on cancelled', "updatedAt"=CURRENT_TIMESTAMP
    WHERE "sourceId"=p_charge AND status IN ('QUEUED','PROCESSING','FAILED');
END;
$$ LANGUAGE plpgsql;
CREATE FUNCTION sixfl_veo_receipt_reversal() RETURNS trigger AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN PERFORM sixfl_sync_cancelled_veo_credit(OLD."chargeId"); END IF;
  IF TG_OP<>'DELETE' THEN PERFORM sixfl_sync_cancelled_veo_credit(NEW."chargeId"); END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sixfl_veo_receipt_reversal AFTER INSERT OR UPDATE OR DELETE ON "PaymentTransaction"
  FOR EACH ROW EXECUTE FUNCTION sixfl_veo_receipt_reversal();
CREATE FUNCTION sixfl_veo_cancelled_charge_guard() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "VeoMatchAddon" WHERE "chargeId"=NEW.id AND "cancelledAt" IS NOT NULL) THEN NEW.status='VOID'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sixfl_veo_cancelled_charge_guard BEFORE UPDATE ON "PaymentCharge"
  FOR EACH ROW EXECUTE FUNCTION sixfl_veo_cancelled_charge_guard();
CREATE FUNCTION sixfl_veo_addon_cancel() RETURNS trigger AS $$
BEGIN
  IF NEW."cancelledAt" IS NOT NULL THEN PERFORM sixfl_sync_cancelled_veo_credit(NEW."chargeId"); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sixfl_veo_addon_cancel AFTER UPDATE ON "VeoMatchAddon"
  FOR EACH ROW EXECUTE FUNCTION sixfl_veo_addon_cancel();
CREATE FUNCTION sixfl_veo_fixture_changed() RETURNS trigger AS $$
BEGIN
  -- A replacement, cancellation or reschedule cannot inherit paid filming consent.
  IF NEW.status::text IN ('CANCELLED','POSTPONED') OR NEW."publishedAt" IS NULL
     OR NEW."homeTeamId" IS DISTINCT FROM OLD."homeTeamId" OR NEW."awayTeamId" IS DISTINCT FROM OLD."awayTeamId"
     OR NEW."kickoffAt" IS DISTINCT FROM OLD."kickoffAt" OR NEW."venueId" IS DISTINCT FROM OLD."venueId"
     OR NEW.pitch IS DISTINCT FROM OLD.pitch THEN
    UPDATE "VeoMatchDecision" SET "failedAt"=CURRENT_TIMESTAMP, "failureReason"='Fixture changed after Veo was agreed'
      WHERE "fixtureId"=NEW.id AND "failedAt" IS NULL
      AND (NEW.status::text IN ('CANCELLED','POSTPONED') OR NEW."publishedAt" IS NULL OR "homeTeamId"<>NEW."homeTeamId"
        OR "awayTeamId"<>NEW."awayTeamId" OR "kickoffAt"<>NEW."kickoffAt" OR "venueId" IS DISTINCT FROM NEW."venueId" OR pitch IS DISTINCT FROM NEW.pitch);
    UPDATE "VeoMatchAddon" SET "cancelledAt"=CURRENT_TIMESTAMP,"cancelReason"='Fixture changed after Veo was agreed'
      WHERE "fixtureId"=NEW.id AND "cancelledAt" IS NULL AND EXISTS (SELECT 1 FROM "VeoMatchDecision" d WHERE d."fixtureId"=NEW.id AND d."failedAt" IS NOT NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM "VeoMatchDecision" d WHERE d."fixtureId"=NEW.id AND d."failedAt" IS NOT NULL) THEN
    UPDATE "Fixture" SET "sixflTvRecorded"=false,"sixflTvUrl"=NULL WHERE id=NEW.id AND ("sixflTvRecorded" OR "sixflTvUrl" IS NOT NULL);
    UPDATE "NotificationDispatch" SET status='CANCELLED',"failureReason"='Veo booking superseded by fixture change',"updatedAt"=CURRENT_TIMESTAMP
      WHERE "sourceType"='FIXTURE_VEO_BOOKING' AND "sourceId"=NEW.id AND status IN ('QUEUED','PROCESSING');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sixfl_veo_fixture_changed AFTER UPDATE ON "Fixture" FOR EACH ROW EXECUTE FUNCTION sixfl_veo_fixture_changed();
CREATE TABLE "VeoMatchNotice" (
  id TEXT PRIMARY KEY,
  "fixtureId" TEXT NOT NULL REFERENCES "VeoMatchDecision"("fixtureId"),
  "teamId" TEXT NOT NULL REFERENCES "Team"(id),
  kind TEXT NOT NULL CHECK (kind IN ('ACCEPTED','FREE','NO_SLOT','FAILED','PITCH_CHANGED')),
  "queuedAt" TIMESTAMP(3),
  "lastError" TEXT,
  UNIQUE ("fixtureId","teamId",kind)
);
INSERT INTO "NotificationTemplate" (id,key,name,description,channel,audience,kind,subject,body,"ctaLabel","ctaUrlKey","isActive","createdAt","updatedAt") VALUES
  ('veo-match-accepted-v1','veo-match-accepted','Veo match booking accepted','Confirmed paid Veo match booking','EMAIL','TEAM','TRANSACTIONAL','Your Veo booking is confirmed — {{fixture_label}}',E'Hi {{team_name}},\n\nYour Veo Priority request is confirmed for {{fixture_label}} on {{kickoff}}.\n\nYour match will be on {{pitch}}. Your kick-off time and opponent have not changed.\n\nThe £5 Veo add-on is listed separately in Team payments. Your original match fee is unchanged. Footage may be published publicly on SIXFL TV/YouTube. If the recording is unavailable, the add-on will be cancelled or any payment returned as team credit.','View fixture','captainFixturesUrl',true,NOW(),NOW()),
  ('veo-match-free-v1','veo-match-free','Veo match filming without extra charge','Camera-pitch allocation without a charge to this team','EMAIL','TEAM','Your match is on the camera pitch — {{fixture_label}}',E'Hi {{team_name}},\n\n{{fixture_label}} on {{kickoff}} is scheduled for filming on {{pitch}}. Your kick-off time and opponent have not changed.\n\nNo extra Veo charge has been added for your team. Footage may be published publicly on SIXFL TV/YouTube.','View fixture','captainFixturesUrl',true,NOW(),NOW()),
  ('veo-match-no-slot-v1','veo-match-no-slot','Veo request not accommodated','No camera slot; no charge','EMAIL','TEAM','Veo update — {{fixture_label}}',E'Hi {{team_name}},\n\nWe could not give your team a Veo place for {{fixture_label}} on {{kickoff}}. There is no Veo charge for this match.\n\nYour fixture is on {{pitch}}. The kick-off time and opponent have not changed. Please check the fixture details before travelling.','View fixture','captainFixturesUrl',true,NOW(),NOW()),
  ('veo-pitch-update-v1','veo-pitch-update','Veo night pitch update','Pitch change for a team without a paid Veo request','EMAIL','TEAM','Pitch update — {{fixture_label}}',E'Hi {{team_name}},\n\nYour fixture {{fixture_label}} on {{kickoff}} is now on {{pitch}}. Your kick-off time and opponent have not changed.\n\nNo extra Veo charge has been added for your team. Please check the updated pitch before your match.','View fixture','captainFixturesUrl',true,NOW(),NOW()),
  ('veo-match-failed-v1','veo-match-failed','Veo recording unavailable','Recording failed: cancel charge or return receipts as credit','EMAIL','TEAM','Veo recording unavailable — {{fixture_label}}',E'Hi {{team_name}},\n\nUnfortunately, the recording of {{fixture_label}} on {{kickoff}} is unavailable.\n\nAny separate Veo add-on for this match has been cancelled. Any payment received for that add-on is returned as team credit. Your original match fee is unchanged.','View team payments','captainPaymentsUrl',true,NOW(),NOW())
ON CONFLICT (key) DO NOTHING;
CREATE FUNCTION sixfl_preserve_veo_match_decision() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'failedAt'-'failureReason') IS DISTINCT FROM (to_jsonb(OLD)-'failedAt'-'failureReason') THEN
    RAISE EXCEPTION 'Veo match agreements are permanent; use recording cancellation for corrections';
  END IF;
  IF OLD."failedAt" IS NOT NULL AND (NEW."failedAt" IS DISTINCT FROM OLD."failedAt" OR NEW."failureReason" IS DISTINCT FROM OLD."failureReason") THEN
    RAISE EXCEPTION 'A cancelled Veo agreement cannot be reactivated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sixfl_preserve_veo_match_decision BEFORE UPDATE OR DELETE ON "VeoMatchDecision" FOR EACH ROW EXECUTE FUNCTION sixfl_preserve_veo_match_decision();
