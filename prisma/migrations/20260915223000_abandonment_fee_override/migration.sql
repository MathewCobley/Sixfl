-- Additive only. Existing decisions retain STANDARD and no historic money moves.
ALTER TABLE "FixtureAbandonment"
  ADD COLUMN IF NOT EXISTS "feeDecision" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "feeOverrideReason" TEXT;
DO $$ BEGIN
  ALTER TABLE "FixtureAbandonment" ADD CONSTRAINT "FixtureAbandonment_feeDecision_check"
    CHECK ("feeDecision" IN ('STANDARD', 'UNCHANGED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FixtureAbandonment" ADD CONSTRAINT "FixtureAbandonment_feeOverrideReason_check"
    CHECK ("feeDecision" <> 'UNCHANGED' OR
      ("feeOverrideReason" IS NOT NULL AND length(trim("feeOverrideReason")) BETWEEN 3 AND 500));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Editable in System Templates. Never overwrite an existing administrator edit.
INSERT INTO "NotificationTemplate" (
  "id", "key", "name", "description", "kind", "channel", "audience", "subject", "body",
  "ctaLabel", "ctaUrlKey", "isActive", "createdAt", "updatedAt"
) VALUES (
  'fixture-abandonment-fees-unchanged-email', 'fixture-abandonment-fees-unchanged-email',
  'Abandoned match — existing fees unchanged',
  'Transactional decision notice for both teams when SIXFL admin explicitly retains existing match fees. Used for initial notices and resends.',
  'TRANSACTIONAL', 'EMAIL', 'TEAM', 'Fixture outcome — fees unchanged: {{fixtureLabel}}',
  E'Hi {{firstName}},\n\nSIXFL has recorded the following outcome for {{fixtureLabel}}.\n\nOutcome: {{outcomeLabel}}.\nReason: {{reasonLabel}}.\n\nSIXFL has decided that both teams’ existing match fees will remain unchanged. No additional abandonment charge, fee waiver, refund or team credit has been applied by this decision.\n\nPayments already made remain against the original fees. Any previously outstanding balance remains due; this notice does not request a second payment.\n\nOfficial result: {{resultSummary}}.\n\nThe fee decision is separate from the result and any conduct review.\n\nSIXFL',
  NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("key") DO NOTHING;
