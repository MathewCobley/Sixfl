ALTER TABLE "Fixture"
  ADD COLUMN IF NOT EXISTS "homeMatchFeePence" INTEGER,
  ADD COLUMN IF NOT EXISTS "awayMatchFeePence" INTEGER;

-- Preserve any existing team-specific active charges. Where a fixture has never
-- had charges (for example an unpublished draft), fall back to the legacy
-- fixture-wide amount so existing fixtures continue to behave as before.
UPDATE "Fixture" fixture
SET
  "homeMatchFeePence" = COALESCE(
    fixture."homeMatchFeePence",
    (
      SELECT charge."amountPence"
      FROM "PaymentCharge" charge
      WHERE charge."fixtureId" = fixture."id"
        AND charge."teamId" = fixture."homeTeamId"
        AND charge."status" <> 'VOID'
      ORDER BY charge."createdAt" DESC
      LIMIT 1
    ),
    fixture."matchFeePence"
  ),
  "awayMatchFeePence" = COALESCE(
    fixture."awayMatchFeePence",
    (
      SELECT charge."amountPence"
      FROM "PaymentCharge" charge
      WHERE charge."fixtureId" = fixture."id"
        AND charge."teamId" = fixture."awayTeamId"
        AND charge."status" <> 'VOID'
      ORDER BY charge."createdAt" DESC
      LIMIT 1
    ),
    fixture."matchFeePence"
  );
