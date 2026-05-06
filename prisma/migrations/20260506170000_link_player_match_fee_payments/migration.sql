-- ========================================
-- File: prisma/migrations/20260506170000_link_player_match_fee_payments/migration.sql
-- ========================================

ALTER TABLE "PaymentTransaction"
  ADD COLUMN IF NOT EXISTS "playerMatchFeeId" TEXT;

CREATE INDEX IF NOT EXISTS "PaymentTransaction_playerMatchFeeId_idx"
  ON "PaymentTransaction"("playerMatchFeeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PaymentTransaction_playerMatchFeeId_fkey'
  ) THEN
    ALTER TABLE "PaymentTransaction"
      ADD CONSTRAINT "PaymentTransaction_playerMatchFeeId_fkey"
      FOREIGN KEY ("playerMatchFeeId") REFERENCES "PlayerMatchFee"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "PaymentTransaction" tx
SET "playerMatchFeeId" = match.player_match_fee_id
FROM (
  SELECT
    id,
    substring("notes" from 'Player fee ID: ([A-Za-z0-9_-]+)') AS player_match_fee_id
  FROM "PaymentTransaction"
  WHERE "playerMatchFeeId" IS NULL
    AND "notes" LIKE '%Player fee ID:%'
) match
WHERE tx.id = match.id
  AND match.player_match_fee_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "PlayerMatchFee" fee
    WHERE fee.id = match.player_match_fee_id
  );
