-- Record actual positive receipts without altering any existing fee/balance.
-- Collection UI minima are not accounting rules for already captured money.
BEGIN;
ALTER TABLE "PlayerRepaymentRequest" DROP CONSTRAINT IF EXISTS "PlayerRepaymentRequest_amountPence_check";
ALTER TABLE "PlayerRepaymentRequest" ADD CONSTRAINT "PlayerRepaymentRequest_amountPence_check" CHECK ("amountPence" > 0);
COMMIT;
