-- Add optional per-option quantities to SIXFL polls.

ALTER TABLE "SIXFLPoll"
  ADD COLUMN IF NOT EXISTS "allowQuantity" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SIXFLPollRecipientOption"
  ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  ALTER TABLE "SIXFLPollRecipientOption"
    ADD CONSTRAINT "SIXFLPollRecipientOption_quantity_positive"
    CHECK ("quantity" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "SIXFLPollRecipientOption_pollId_quantity_idx"
  ON "SIXFLPollRecipientOption"("pollId", "quantity");
