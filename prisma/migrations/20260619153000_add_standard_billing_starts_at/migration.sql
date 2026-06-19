-- ========================================
-- File: prisma/migrations/20260619153000_add_standard_billing_starts_at/migration.sql
-- ========================================

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "standardBillingStartsAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Team_standardBillingStartsAt_idx"
  ON "Team"("standardBillingStartsAt");

-- Dynamo Kebab and Crescent United became standard teams on 17 June 2026.
-- Anything for fixtures before that date belongs to the previous managed-team period
-- and must not count towards standard-team squad/player payment collection.
UPDATE "Team"
SET "standardBillingStartsAt" = TIMESTAMP '2026-06-17 00:00:00.000'
WHERE lower("name") IN ('dynamo kebab', 'crescent united');

UPDATE "PlayerMatchFee" pmf
SET
  "status" = 'CANCELLED'::"PlayerMatchFeeStatus",
  "cancelledAt" = COALESCE(pmf."cancelledAt", NOW()),
  "paymentUrl" = NULL,
  "paymentToken" = NULL,
  "note" = CASE
    WHEN pmf."note" IS NULL OR trim(pmf."note") = '' THEN 'Ignored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
    WHEN pmf."note" LIKE '%Ignored for standard-team billing:%' THEN pmf."note"
    ELSE pmf."note" || E'\nIgnored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
  END,
  "updatedAt" = NOW()
FROM "Fixture" f
INNER JOIN "Team" t ON t."id" = pmf."teamId"
WHERE pmf."fixtureId" = f."id"
  AND t."standardBillingStartsAt" IS NOT NULL
  AND f."kickoffAt" < t."standardBillingStartsAt"
  AND pmf."status" <> 'CANCELLED'::"PlayerMatchFeeStatus";

UPDATE "PaymentCharge" pc
SET
  "status" = 'VOID'::"PaymentChargeStatus",
  "paymentToken" = NULL,
  "lastStripeCheckoutUrl" = NULL,
  "lastStripeCheckoutSessionId" = NULL,
  "lastStripeCheckoutCreatedAt" = NULL,
  "lastStripeCheckoutAmountPence" = NULL,
  "description" = CASE
    WHEN pc."description" IS NULL OR trim(pc."description") = '' THEN 'Ignored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
    WHEN pc."description" LIKE '%Ignored for standard-team billing:%' THEN pc."description"
    ELSE pc."description" || E'\nIgnored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
  END,
  "updatedAt" = NOW()
FROM "Fixture" f
INNER JOIN "Team" t ON t."id" = pc."teamId"
WHERE pc."fixtureId" = f."id"
  AND t."standardBillingStartsAt" IS NOT NULL
  AND f."kickoffAt" < t."standardBillingStartsAt"
  AND pc."status" <> 'VOID'::"PaymentChargeStatus";

CREATE OR REPLACE FUNCTION sixfl_cancel_pre_standard_player_match_fee()
RETURNS TRIGGER AS $$
DECLARE
  billing_start TIMESTAMP(3);
  fixture_kickoff TIMESTAMP(3);
  ignore_note TEXT := 'Ignored for standard-team billing: fixture was before the team became a standard team.';
BEGIN
  SELECT t."standardBillingStartsAt"
  INTO billing_start
  FROM "Team" t
  WHERE t."id" = NEW."teamId";

  IF billing_start IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT f."kickoffAt"
  INTO fixture_kickoff
  FROM "Fixture" f
  WHERE f."id" = NEW."fixtureId";

  IF fixture_kickoff IS NOT NULL AND fixture_kickoff < billing_start THEN
    NEW."status" := 'CANCELLED'::"PlayerMatchFeeStatus";
    NEW."cancelledAt" := COALESCE(NEW."cancelledAt", NOW());
    NEW."paidAt" := NULL;
    NEW."waivedAt" := NULL;
    NEW."paymentUrl" := NULL;
    NEW."paymentToken" := NULL;
    NEW."note" := CASE
      WHEN NEW."note" IS NULL OR trim(NEW."note") = '' THEN ignore_note
      WHEN NEW."note" LIKE '%Ignored for standard-team billing:%' THEN NEW."note"
      ELSE NEW."note" || E'\n' || ignore_note
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "sixfl_cancel_pre_standard_player_match_fee_trigger" ON "PlayerMatchFee";
CREATE TRIGGER "sixfl_cancel_pre_standard_player_match_fee_trigger"
BEFORE INSERT OR UPDATE OF "teamId", "fixtureId", "status", "amountPence"
ON "PlayerMatchFee"
FOR EACH ROW
EXECUTE FUNCTION sixfl_cancel_pre_standard_player_match_fee();

CREATE OR REPLACE FUNCTION sixfl_void_pre_standard_payment_charge()
RETURNS TRIGGER AS $$
DECLARE
  billing_start TIMESTAMP(3);
  fixture_kickoff TIMESTAMP(3);
  ignore_note TEXT := 'Ignored for standard-team billing: fixture was before the team became a standard team.';
BEGIN
  IF NEW."fixtureId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t."standardBillingStartsAt"
  INTO billing_start
  FROM "Team" t
  WHERE t."id" = NEW."teamId";

  IF billing_start IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT f."kickoffAt"
  INTO fixture_kickoff
  FROM "Fixture" f
  WHERE f."id" = NEW."fixtureId";

  IF fixture_kickoff IS NOT NULL AND fixture_kickoff < billing_start THEN
    NEW."status" := 'VOID'::"PaymentChargeStatus";
    NEW."paymentToken" := NULL;
    NEW."lastStripeCheckoutUrl" := NULL;
    NEW."lastStripeCheckoutSessionId" := NULL;
    NEW."lastStripeCheckoutCreatedAt" := NULL;
    NEW."lastStripeCheckoutAmountPence" := NULL;
    NEW."description" := CASE
      WHEN NEW."description" IS NULL OR trim(NEW."description") = '' THEN ignore_note
      WHEN NEW."description" LIKE '%Ignored for standard-team billing:%' THEN NEW."description"
      ELSE NEW."description" || E'\n' || ignore_note
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "sixfl_void_pre_standard_payment_charge_trigger" ON "PaymentCharge";
CREATE TRIGGER "sixfl_void_pre_standard_payment_charge_trigger"
BEFORE INSERT OR UPDATE OF "teamId", "fixtureId", "status", "amountPence"
ON "PaymentCharge"
FOR EACH ROW
EXECUTE FUNCTION sixfl_void_pre_standard_payment_charge();
