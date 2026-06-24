-- ========================================
-- Migration: clean truncated AI prediction headlines
-- ========================================

UPDATE "FixtureAiPrediction"
SET "headline" = 'AI match preview',
    "updatedAt" = NOW()
WHERE "headline" IS NOT NULL
  AND (
    RIGHT(TRIM("headline"), 1) = '…'
    OR RIGHT(TRIM("headline"), 3) = '...'
  );
