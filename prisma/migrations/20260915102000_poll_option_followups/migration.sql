-- Allow each poll answer to have its own confirmation message and follow-up question.

ALTER TABLE "SIXFLPollOption"
  ADD COLUMN IF NOT EXISTS "responseMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "followUpPrompt" TEXT;
