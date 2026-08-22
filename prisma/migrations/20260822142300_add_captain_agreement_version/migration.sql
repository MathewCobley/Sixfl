-- Track which captain terms/rules version was accepted.
-- Existing acceptances remain valid but may have a NULL version because the
-- system did not previously record one. New acceptances record the active version.

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "captainAgreementVersion" TEXT;
