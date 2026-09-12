-- Additive only. Existing referrals remain unchanged until an admin decides.
ALTER TABLE "TeamReferral"
  ADD COLUMN "ineligibleAt" TIMESTAMP(3),
  ADD COLUMN "ineligibleByUserId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD COLUMN "ineligibleByName" TEXT,
  ADD COLUMN "ineligibleReasonCode" TEXT,
  ADD COLUMN "ineligibleNote" TEXT,
  ADD CONSTRAINT "TeamReferral_ineligibility_complete" CHECK (
    ("ineligibleAt" IS NULL AND "ineligibleByUserId" IS NULL AND "ineligibleByName" IS NULL
      AND "ineligibleReasonCode" IS NULL AND "ineligibleNote" IS NULL)
    OR ("ineligibleAt" IS NOT NULL AND "ineligibleByUserId" IS NOT NULL AND "ineligibleByName" IS NOT NULL
      AND "ineligibleReasonCode" IS NOT NULL AND "ineligibleReasonCode" IN ('EXISTING_TEAM','DUPLICATE_REFERRAL','WITHDRAWN_TEAM','TERMS_NOT_MET')
      AND "ineligibleNote" IS NOT NULL AND length(btrim("ineligibleNote")) BETWEEN 10 AND 1000
      AND "paidAt" IS NULL AND "payoutDetailsCiphertext" IS NULL
      AND "payoutDetailsIv" IS NULL AND "payoutDetailsAuthTag" IS NULL)
  );

CREATE FUNCTION sixfl_referral_ineligibility_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."ineligibleAt" IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'An ineligible referral decision must be retained.'; END IF;
    IF ROW(NEW."ineligibleAt",NEW."ineligibleByUserId",NEW."ineligibleByName",NEW."ineligibleReasonCode",NEW."ineligibleNote",NEW."interestLeadId",NEW."referrerUserId")
      IS DISTINCT FROM ROW(OLD."ineligibleAt",OLD."ineligibleByUserId",OLD."ineligibleByName",OLD."ineligibleReasonCode",OLD."ineligibleNote",OLD."interestLeadId",OLD."referrerUserId") THEN
      RAISE EXCEPTION 'Referral eligibility decisions require a separate audited review to change.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW."ineligibleAt" IS NOT NULL AND OLD."ineligibleAt" IS NULL THEN
    IF OLD."paidAt" IS NOT NULL THEN RAISE EXCEPTION 'An already-paid referral cannot be rejected.'; END IF;
    IF EXISTS (SELECT 1 FROM "NotificationDispatch" WHERE "sourceId"=OLD.id
      AND "sourceType" IN ('team-referral-recorded','team-referral-payout-ready') AND status='PROCESSING') THEN
      RAISE EXCEPTION 'A referral email is currently sending. Check its status before retrying.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TeamReferral_ineligibility_guard" BEFORE UPDATE OR DELETE ON "TeamReferral"
  FOR EACH ROW EXECUTE FUNCTION sixfl_referral_ineligibility_guard();

-- Stale producers and retries cannot queue or claim a rejected reward email.
-- The referral lock serializes a send claim with rejection. An in-flight send
-- blocks rejection, rather than falsely promising to recall an accepted email.
CREATE FUNCTION sixfl_referral_reward_dispatch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rejected_at TIMESTAMP(3);
BEGIN
  IF NEW."sourceType" IN ('team-referral-recorded','team-referral-payout-ready')
    AND NEW.status IN ('QUEUED','PROCESSING') THEN
    SELECT "ineligibleAt" INTO rejected_at FROM "TeamReferral" WHERE id=NEW."sourceId" FOR UPDATE;
    IF FOUND AND rejected_at IS NOT NULL THEN
      RAISE EXCEPTION 'This referral is not eligible; reward emails are blocked.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "NotificationDispatch_referral_eligibility_guard"
  BEFORE INSERT OR UPDATE OF status, "sourceType", "sourceId" ON "NotificationDispatch"
  FOR EACH ROW EXECUTE FUNCTION sixfl_referral_reward_dispatch_guard();
