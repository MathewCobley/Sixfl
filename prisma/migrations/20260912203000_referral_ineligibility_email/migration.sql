-- Template only: no existing referral is changed and no historical notice queued.
INSERT INTO "NotificationTemplate" ("id", "key", "name", "description", "kind", "channel", "audience", "subject", "body", "ctaLabel", "ctaUrlKey", "isActive", "createdAt", "updatedAt")
VALUES ('team-referral-ineligible', 'team-referral-ineligible', 'Referral not eligible email',
  'Brief eligibility decision sent to the referring player. Only public reason labels are supplied; private admin notes are never available.',
  'TRANSACTIONAL', 'EMAIL', 'USER', 'Update on your SIXFL referral — {{teamName}}',
  $body$Hi {{firstName}},

We've reviewed your referral for {{teamName}}. It does not qualify for the {{rewardAmount}} referral reward.

Reason: {{eligibilityReason}}.

Your referral is now marked "Not eligible", so no payment will be made for it. This does not affect any other eligible referrals.

Sorry for any confusion. Please reply if you have any questions.

View your referral: {{referralsUrl}}$body$,
  'View my referrals', 'referralsUrl', true, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- Exactly one decision notice per referral, including failed or skipped notices.
-- Queue retry updates that same dispatch instead of creating a second message.
CREATE UNIQUE INDEX "NotificationDispatch_referral_ineligible_once"
  ON "NotificationDispatch" ("sourceId") WHERE "sourceType" = 'team-referral-ineligible';

CREATE FUNCTION sixfl_referral_ineligible_notice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sourceType" = 'team-referral-ineligible' THEN
    IF NEW.channel <> 'EMAIL' OR NEW."sourceId" IS NULL THEN
      RAISE EXCEPTION 'A referral eligibility notice must be an email tied to a referral.';
    END IF;
    IF NEW.status IN ('QUEUED', 'PROCESSING') THEN
      PERFORM 1 FROM "TeamReferral" WHERE id=NEW."sourceId" AND "ineligibleAt" IS NOT NULL AND "paidAt" IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'An eligibility notice requires an unpaid referral marked not eligible.'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "NotificationDispatch_referral_ineligible_notice_guard"
  BEFORE INSERT OR UPDATE OF status, "sourceType", "sourceId", channel ON "NotificationDispatch"
  FOR EACH ROW EXECUTE FUNCTION sixfl_referral_ineligible_notice_guard();
