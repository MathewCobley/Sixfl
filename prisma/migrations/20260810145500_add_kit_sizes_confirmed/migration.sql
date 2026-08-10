-- Track whether a team has physically tried on a sample shirt and confirmed
-- the sizes used for its kit order. Existing orders start unconfirmed so they
-- remain visible as a match-night sizing action until SIXFL ticks them off.
ALTER TABLE "TeamKitOrder"
  ADD COLUMN IF NOT EXISTS "sizesConfirmed" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "TeamKitOrder_sizesConfirmed_status_idx"
  ON "TeamKitOrder"("sizesConfirmed", "status");
