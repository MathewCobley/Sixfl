-- Store generated SIXFL AI Predictor text separately from fixtures.
-- This is intentionally non-destructive and safe for live data.

CREATE TABLE IF NOT EXISTS "FixtureAiPrediction" (
  "fixtureId" TEXT PRIMARY KEY,
  "headline" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'fallback',
  "inputHash" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixtureAiPrediction_fixtureId_fkey"
    FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FixtureAiPrediction_source_idx"
  ON "FixtureAiPrediction"("source");

CREATE INDEX IF NOT EXISTS "FixtureAiPrediction_generatedAt_idx"
  ON "FixtureAiPrediction"("generatedAt");
