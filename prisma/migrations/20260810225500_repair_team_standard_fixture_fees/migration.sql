-- Repair future fixture fees that were created from the old shared-fee logic.
--
-- The intended rule is:
--   * each team defaults to Team.standardMatchFeePence;
--   * a non-null Fixture.homeMatchFeePence / awayMatchFeePence is the saved
--     per-fixture value and therefore wins;
--   * already-paid money is never rewritten by this repair.
--
-- This specifically fixes fixtures where one team (for example £36) was given
-- the other team's higher shared fee (for example £40) because the generator
-- stored only MAX(home standard fee, away standard fee).

-- First repair open, completely-unpaid team charges while the old per-team
-- fixture field is still NULL. Charges with any direct transaction or paid
-- player fee are deliberately left alone for manual review.
UPDATE "PaymentCharge" charge
SET
  "amountPence" = team."standardMatchFeePence",
  "updatedAt" = NOW()
FROM "Fixture" fixture
JOIN "Team" team
  ON team."id" IN (fixture."homeTeamId", fixture."awayTeamId")
WHERE charge."fixtureId" = fixture."id"
  AND charge."teamId" = team."id"
  AND fixture."status" = 'SCHEDULED'
  AND fixture."kickoffAt" >= NOW()
  AND charge."status" <> 'VOID'
  AND team."standardMatchFeePence" > 0
  AND charge."amountPence" = COALESCE(fixture."matchFeePence", 4000)
  AND (
    (charge."teamId" = fixture."homeTeamId" AND fixture."homeMatchFeePence" IS NULL)
    OR
    (charge."teamId" = fixture."awayTeamId" AND fixture."awayMatchFeePence" IS NULL)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "PaymentTransaction" transaction
    WHERE transaction."chargeId" = charge."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "PlayerMatchFee" player_fee
    WHERE player_fee."fixtureId" = fixture."id"
      AND player_fee."teamId" = charge."teamId"
      AND player_fee."status" = 'PAID'
  );

-- A team whose standard fixture fee is explicitly £0 should not keep an unpaid
-- legacy charge. Void only untouched charges; never void anything with money on it.
UPDATE "PaymentCharge" charge
SET
  "status" = 'VOID',
  "updatedAt" = NOW()
FROM "Fixture" fixture
JOIN "Team" team
  ON team."id" IN (fixture."homeTeamId", fixture."awayTeamId")
WHERE charge."fixtureId" = fixture."id"
  AND charge."teamId" = team."id"
  AND fixture."status" = 'SCHEDULED'
  AND fixture."kickoffAt" >= NOW()
  AND charge."status" <> 'VOID'
  AND team."standardMatchFeePence" = 0
  AND charge."amountPence" = COALESCE(fixture."matchFeePence", 4000)
  AND (
    (charge."teamId" = fixture."homeTeamId" AND fixture."homeMatchFeePence" IS NULL)
    OR
    (charge."teamId" = fixture."awayTeamId" AND fixture."awayMatchFeePence" IS NULL)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "PaymentTransaction" transaction
    WHERE transaction."chargeId" = charge."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "PlayerMatchFee" player_fee
    WHERE player_fee."fixtureId" = fixture."id"
      AND player_fee."teamId" = charge."teamId"
      AND player_fee."status" = 'PAID'
  );

-- Populate missing per-team fixture values from each team's own standard fee.
-- Existing non-null per-fixture values are preserved as explicit overrides.
UPDATE "Fixture" fixture
SET
  "homeMatchFeePence" = COALESCE(
    fixture."homeMatchFeePence",
    home_team."standardMatchFeePence"
  ),
  "awayMatchFeePence" = COALESCE(
    fixture."awayMatchFeePence",
    away_team."standardMatchFeePence"
  ),
  "matchFeePence" = GREATEST(
    COALESCE(fixture."homeMatchFeePence", home_team."standardMatchFeePence", 0),
    COALESCE(fixture."awayMatchFeePence", away_team."standardMatchFeePence", 0)
  ),
  "updatedAt" = NOW()
FROM "Team" home_team, "Team" away_team
WHERE home_team."id" = fixture."homeTeamId"
  AND away_team."id" = fixture."awayTeamId"
  AND fixture."status" = 'SCHEDULED'
  AND fixture."kickoffAt" >= NOW()
  AND (
    fixture."homeMatchFeePence" IS NULL
    OR fixture."awayMatchFeePence" IS NULL
  );
