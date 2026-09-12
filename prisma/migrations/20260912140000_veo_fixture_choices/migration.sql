-- The existing opt-in switches, fixtures, payments and legacy price snapshots are untouched.
-- New filming choices are collected at confirmation; publication no longer sells a new slot.
ALTER TABLE "VeoLeagueSettings" ADD COLUMN "confirmAtFixture" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "VeoFixtureRequest" (
  "fixtureId" TEXT NOT NULL REFERENCES "Fixture"(id) ON DELETE RESTRICT,
  "teamId" TEXT NOT NULL REFERENCES "Team"(id) ON DELETE RESTRICT,
  "leagueId" TEXT NOT NULL REFERENCES "League"(id) ON DELETE RESTRICT,
  "choice" TEXT NOT NULL CHECK (choice IN ('NONE','MATCH','ONGOING')),
  "status" TEXT NOT NULL CHECK (status IN ('NONE','REQUESTED','ACCEPTED','UNAVAILABLE','CANCELLED')),
  "actorId" TEXT NOT NULL, "termsVersion" TEXT NOT NULL,
  "homeTeamId" TEXT NOT NULL, "awayTeamId" TEXT NOT NULL,
  "kickoffAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "basePence" INTEGER CHECK ("basePence" >= 0),
  "agreedPence" INTEGER CHECK ("agreedPence" IN (0,500)),
  "chargeId" TEXT UNIQUE REFERENCES "PaymentCharge"(id) ON DELETE RESTRICT,
  PRIMARY KEY ("fixtureId", "teamId")
);
CREATE INDEX "VeoFixtureRequest_league_status" ON "VeoFixtureRequest"("leagueId", status);
CREATE TABLE "VeoMatchBooking" (
  "fixtureId" TEXT PRIMARY KEY REFERENCES "Fixture"(id) ON DELETE RESTRICT,
  "leagueId" TEXT NOT NULL, "cameraKey" TEXT NOT NULL,
  "homeTeamId" TEXT NOT NULL, "awayTeamId" TEXT NOT NULL,
  "kickoffAt" TIMESTAMP(3) NOT NULL, "venueId" TEXT, pitch TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PLANNED' CHECK (state IN ('PLANNED','READY','FAILED','CANCELLED')),
  "decidedBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordingNote" TEXT
);
CREATE INDEX "VeoMatchBooking_camera" ON "VeoMatchBooking"("cameraKey", state);
-- Voiding a failed recording restores only the payment actually received (cash OR
-- team credit). It never creates a £5 credit for a team which has not paid. The
-- stable credit row also covers a late checkout receipt, reversal or cash correction.
CREATE FUNCTION sixfl_sync_void_veo_credit(cid TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE r RECORD; paid INTEGER;
BEGIN
  SELECT q."fixtureId", q."teamId", q."actorId" INTO r
  FROM "VeoFixtureRequest" q JOIN "VeoMatchBooking" b ON b."fixtureId" = q."fixtureId"
  WHERE q."chargeId" = cid AND b.state IN ('FAILED','CANCELLED');
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM id FROM "PaymentCharge" WHERE id = cid FOR NO KEY UPDATE;
  SELECT GREATEST(COALESCE(SUM("amountPence"),0),0)::integer INTO paid
  FROM "PaymentTransaction" WHERE "chargeId" = cid;
  IF paid > 0 THEN
    INSERT INTO "TeamCreditLedgerEntry" (id, "teamId", "sourceFixtureId", "chargeId", "entryType", "amountPence", description, "createdByUserId")
    VALUES ('tcred_veo_cancel_' || cid, r."teamId", r."fixtureId", cid, 'CREDIT_ADDED', paid,
      'Veo recording unavailable: payment returned to team credit.', r."actorId")
    ON CONFLICT (id) DO UPDATE SET "amountPence" = EXCLUDED."amountPence";
  ELSE
    DELETE FROM "TeamCreditLedgerEntry" WHERE id = 'tcred_veo_cancel_' || cid;
  END IF;
END $$;
CREATE FUNCTION sixfl_veo_receipt_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN PERFORM sixfl_sync_void_veo_credit(NEW."chargeId"); END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."chargeId" IS DISTINCT FROM NEW."chargeId") THEN
    PERFORM sixfl_sync_void_veo_credit(OLD."chargeId");
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER sixfl_veo_receipt_credit AFTER INSERT OR UPDATE OR DELETE ON "PaymentTransaction"
FOR EACH ROW EXECUTE FUNCTION sixfl_veo_receipt_credit();
CREATE FUNCTION sixfl_veo_void_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "VeoFixtureRequest" r JOIN "VeoMatchBooking" b ON b."fixtureId"=r."fixtureId"
    WHERE r."chargeId"=NEW.id AND b.state IN ('FAILED','CANCELLED')) THEN
    NEW.status := 'VOID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sixfl_veo_void_guard BEFORE UPDATE ON "PaymentCharge" FOR EACH ROW EXECUTE FUNCTION sixfl_veo_void_guard();
CREATE FUNCTION sixfl_veo_void_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status::text = 'VOID' THEN PERFORM sixfl_sync_void_veo_credit(NEW.id); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER sixfl_veo_void_credit AFTER UPDATE ON "PaymentCharge" FOR EACH ROW EXECUTE FUNCTION sixfl_veo_void_credit();
-- Keep the agreed match identity stable. Normal cancellation/postponement must
-- remain possible and automatically cancels its optional filming booking.
CREATE FUNCTION sixfl_veo_fixture_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "VeoMatchBooking" b WHERE b."fixtureId"=OLD.id AND b.state IN ('PLANNED','READY'))
     AND NEW.status::text NOT IN ('CANCELLED','POSTPONED')
     AND (NEW."homeTeamId" IS DISTINCT FROM OLD."homeTeamId" OR NEW."awayTeamId" IS DISTINCT FROM OLD."awayTeamId"
       OR NEW."kickoffAt" IS DISTINCT FROM OLD."kickoffAt" OR NEW."venueId" IS DISTINCT FROM OLD."venueId" OR NEW.pitch IS DISTINCT FROM OLD.pitch) THEN
    RAISE EXCEPTION 'Cancel the accepted Veo booking on the league Veo page before changing its teams, time, venue or pitch.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sixfl_veo_fixture_guard BEFORE UPDATE ON "Fixture" FOR EACH ROW EXECUTE FUNCTION sixfl_veo_fixture_guard();
CREATE FUNCTION sixfl_cancel_veo_with_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status::text IN ('CANCELLED','POSTPONED') THEN
    UPDATE "VeoMatchBooking" SET state='CANCELLED', "updatedAt"=NOW(), "recordingNote"='Fixture cancelled or postponed.'
    WHERE "fixtureId"=NEW.id AND state IN ('PLANNED','READY');
    UPDATE "VeoFixtureRequest" SET status='CANCELLED', revision=revision+1 WHERE "fixtureId"=NEW.id AND status IN ('REQUESTED','ACCEPTED');
    UPDATE "PaymentCharge" SET status='VOID', "updatedAt"=NOW() WHERE id IN (SELECT "chargeId" FROM "VeoFixtureRequest" WHERE "fixtureId"=NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER sixfl_cancel_veo_with_fixture AFTER UPDATE OF status ON "Fixture" FOR EACH ROW EXECUTE FUNCTION sixfl_cancel_veo_with_fixture();
