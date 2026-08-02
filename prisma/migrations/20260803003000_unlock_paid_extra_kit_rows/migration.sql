-- The founding offer includes seven kits, but fully paid additional kits must
-- be able to add more personalisation rows to the same supplier order.

ALTER TABLE "TeamKitOrder"
  DROP CONSTRAINT IF EXISTS "TeamKitOrder_kitQuantity_check";

UPDATE "TeamKitOrder"
SET "kitQuantity" = GREATEST(7, LEAST(99, "kitQuantity"));

ALTER TABLE "TeamKitOrder"
  ALTER COLUMN "kitQuantity" SET DEFAULT 7;

ALTER TABLE "TeamKitOrder"
  ADD CONSTRAINT "TeamKitOrder_kitQuantity_check"
  CHECK ("kitQuantity" BETWEEN 7 AND 99);

ALTER TABLE "TeamKitOrderItem"
  DROP CONSTRAINT IF EXISTS "TeamKitOrderItem_position_check";

ALTER TABLE "TeamKitOrderItem"
  ADD CONSTRAINT "TeamKitOrderItem_position_check"
  CHECK ("position" BETWEEN 1 AND 99);
