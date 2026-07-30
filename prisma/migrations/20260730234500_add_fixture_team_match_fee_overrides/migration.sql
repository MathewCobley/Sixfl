ALTER TABLE "Fixture"
  ADD COLUMN IF NOT EXISTS "homeMatchFeePence" INTEGER,
  ADD COLUMN IF NOT EXISTS "awayMatchFeePence" INTEGER;

-- Preserve existing team-specific active charges. If a fixture has an active
-- charge for only one side, the other side was intentionally free and is
-- backfilled as zero. Fixtures with no charges retain the legacy shared amount.
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
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM "PaymentCharge" charge
        WHERE charge."fixtureId" = fixture."id"
          AND charge."status" <> 'VOID'
      ) THEN 0
      ELSE fixture."matchFeePence"
    END
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
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM "PaymentCharge" charge
        WHERE charge."fixtureId" = fixture."id"
          AND charge."status" <> 'VOID'
      ) THEN 0
      ELSE fixture."matchFeePence"
    END
  );
