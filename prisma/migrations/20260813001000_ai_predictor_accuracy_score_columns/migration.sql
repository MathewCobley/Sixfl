-- Persist the scoreline used by the SIXFL predictor so completed fixtures can be audited.
-- The predictor already adds these columns defensively at runtime; IF NOT EXISTS keeps
-- this migration safe for databases where that runtime guard has already run.

ALTER TABLE "FixtureAiPrediction"
  ADD COLUMN IF NOT EXISTS "predictedHomeScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "predictedAwayScore" INTEGER;
