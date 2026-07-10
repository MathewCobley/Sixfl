-- Add support for single-choice and multiple-choice SIXFL polls.

ALTER TABLE "SIXFLPoll"
  ADD COLUMN IF NOT EXISTS "choiceMode" TEXT NOT NULL DEFAULT 'SINGLE';

DO $$
BEGIN
  ALTER TABLE "SIXFLPoll"
    ADD CONSTRAINT "SIXFLPoll_choiceMode_check"
    CHECK ("choiceMode" IN ('SINGLE', 'MULTIPLE'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SIXFLPollRecipientOption" (
  "id" TEXT PRIMARY KEY,
  "recipientId" TEXT NOT NULL REFERENCES "SIXFLPollRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "pollId" TEXT NOT NULL REFERENCES "SIXFLPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "optionId" TEXT NOT NULL REFERENCES "SIXFLPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "SIXFLPollRecipientOption_recipientId_optionId_key"
  ON "SIXFLPollRecipientOption"("recipientId", "optionId");

CREATE INDEX IF NOT EXISTS "SIXFLPollRecipientOption_pollId_optionId_idx"
  ON "SIXFLPollRecipientOption"("pollId", "optionId");

CREATE INDEX IF NOT EXISTS "SIXFLPollRecipientOption_recipientId_idx"
  ON "SIXFLPollRecipientOption"("recipientId");

-- Backfill existing single-choice votes into the multi-select join table.
INSERT INTO "SIXFLPollRecipientOption" (
  "id",
  "recipientId",
  "pollId",
  "optionId",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT(recipient."id", ':', recipient."selectedOptionId"),
  recipient."id",
  recipient."pollId",
  recipient."selectedOptionId",
  COALESCE(recipient."votedAt", recipient."updatedAt", CURRENT_TIMESTAMP),
  COALESCE(recipient."votedAt", recipient."updatedAt", CURRENT_TIMESTAMP)
FROM "SIXFLPollRecipient" recipient
WHERE recipient."selectedOptionId" IS NOT NULL
ON CONFLICT DO NOTHING;
