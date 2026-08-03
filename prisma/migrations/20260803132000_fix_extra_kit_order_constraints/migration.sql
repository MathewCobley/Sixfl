-- Paid kit orders are not always seven-kit founding packages.
-- Standard teams may start with a single paid kit, and either type of team may
-- add further paid slots after the original order was submitted.

ALTER TABLE "TeamKitOrder"
  DROP CONSTRAINT IF EXISTS "TeamKitOrder_kitQuantity_check";

UPDATE "TeamKitOrder"
SET "kitQuantity" = GREATEST(1, LEAST(99, "kitQuantity"));

ALTER TABLE "TeamKitOrder"
  ADD CONSTRAINT "TeamKitOrder_kitQuantity_check"
  CHECK ("kitQuantity" BETWEEN 1 AND 99);

ALTER TABLE "TeamKitOrderItem"
  DROP CONSTRAINT IF EXISTS "TeamKitOrderItem_position_check";

ALTER TABLE "TeamKitOrderItem"
  ADD CONSTRAINT "TeamKitOrderItem_position_check"
  CHECK ("position" BETWEEN 1 AND 99);

-- The original player-assignment table was limited to the seven included
-- positions, so assigning kit 8 or later failed at the database even though the
-- paid kit appeared on the captain page.
ALTER TABLE "TeamKitPlayerAssignment"
  DROP CONSTRAINT IF EXISTS "TeamKitPlayerAssignment_position_check";

ALTER TABLE "TeamKitPlayerAssignment"
  ADD CONSTRAINT "TeamKitPlayerAssignment_position_check"
  CHECK ("position" BETWEEN 1 AND 99);

-- A player may legitimately buy more than one complete kit. Keep lookups fast,
-- but do not enforce one assignment per player for the whole team.
DROP INDEX IF EXISTS "TeamKitPlayerAssignment_teamId_teamMemberId_key";

CREATE INDEX IF NOT EXISTS "TeamKitPlayerAssignment_teamId_teamMemberId_idx"
  ON "TeamKitPlayerAssignment"("teamId", "teamMemberId");
