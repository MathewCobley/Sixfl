-- Add configurable button text for SIXFL poll email buttons.

ALTER TABLE "SIXFLPoll"
  ADD COLUMN IF NOT EXISTS "buttonText" TEXT NOT NULL DEFAULT 'Open poll';

UPDATE "SIXFLPoll"
SET "buttonText" = 'Open poll'
WHERE "buttonText" IS NULL OR btrim("buttonText") = '';
