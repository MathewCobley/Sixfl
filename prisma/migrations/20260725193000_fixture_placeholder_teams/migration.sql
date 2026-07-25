-- Allow admin-only fixture placeholder teams such as TBC.
-- These teams can occupy a fixture slot but must be excluded from public tables,
-- team counts, round-robin generation, payments, confirmations and predictions.

ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "isFixturePlaceholder" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Team_isFixturePlaceholder_idx"
  ON "Team"("isFixturePlaceholder");

CREATE INDEX IF NOT EXISTS "Team_fixturePlaceholder_name_idx"
  ON "Team"("isFixturePlaceholder", "name");
