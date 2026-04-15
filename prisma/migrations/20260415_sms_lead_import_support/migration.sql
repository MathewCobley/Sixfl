-- ========================================
-- File: prisma/migrations/20260415_sms_lead_import_support/migration.sql
-- ========================================

ALTER TABLE "InterestLead"
ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "InterestLead"
ADD COLUMN "phoneNormalized" TEXT;

CREATE INDEX "InterestLead_phoneNormalized_idx"
ON "InterestLead"("phoneNormalized");