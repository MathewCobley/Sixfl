-- ========================================
-- File: prisma/migrations/20260624120000_add_payment_late_admin_fee_fields/migration.sql
-- ========================================

CREATE TYPE "PaymentLateFeeStatus" AS ENUM ('NONE', 'WARNING', 'APPLIED', 'WAIVED');

ALTER TABLE "PaymentCharge"
  ADD COLUMN "latePaymentFeeStatus" "PaymentLateFeeStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "latePaymentFeeAmountPence" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "latePaymentFeeNote" TEXT,
  ADD COLUMN "latePaymentFeeWarningAt" TIMESTAMP(3),
  ADD COLUMN "latePaymentFeeAppliedAt" TIMESTAMP(3),
  ADD COLUMN "latePaymentFeeWaivedAt" TIMESTAMP(3);

CREATE INDEX "PaymentCharge_latePaymentFeeStatus_idx"
  ON "PaymentCharge"("latePaymentFeeStatus");

CREATE INDEX "PaymentCharge_dueDate_latePaymentFeeStatus_idx"
  ON "PaymentCharge"("dueDate", "latePaymentFeeStatus");
