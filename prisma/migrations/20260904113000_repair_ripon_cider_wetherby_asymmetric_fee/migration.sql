-- Repair the upcoming Harrogate Tuesday Mens fixture between Ripon Cider Boys
-- and Wetherby Wanderers after a one-sided £0 edit incorrectly allowed the
-- other side to fall back to the shared £0 fixture value.
--
-- Intended result:
--   * Ripon Cider Boys remains an explicit £0 for this fixture only;
--   * Wetherby Wanderers keeps/restores its own charge;
--   * prefer Wetherby's existing positive fixture charge (if one was merely
--     voided), then its configured standard fee, then the SIXFL £40 default;
--   * never rewrite money that has already been paid.

-- 1. Correct the side-specific fixture values. Only the nearest upcoming
-- matching scheduled fixture is touched, so future rematches are unaffected.
WITH candidate AS (
  SELECT
    fixture."id" AS fixture_id,
    fixture."leagueId" AS league_id,
    COALESCE(fixture."kickoffAt", fixture."date") AS kickoff_at,
    CASE
      WHEN home_team."name" = 'Ripon Cider Boys' THEN home_team."id"
      ELSE away_team."id"
    END AS ripon_id,
    CASE
      WHEN home_team."name" = 'Wetherby Wanderers' THEN home_team."id"
      ELSE away_team."id"
    END AS wetherby_id
  FROM "Fixture" fixture
  JOIN "League" league ON league."id" = fixture."leagueId"
  JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
  JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
  WHERE league."name" = 'Harrogate Tuesday Mens'
    AND fixture."status" = 'SCHEDULED'
    AND COALESCE(fixture."kickoffAt", fixture."date") >= TIMESTAMP '2026-09-04 00:00:00'
    AND (
      (home_team."name" = 'Ripon Cider Boys' AND away_team."name" = 'Wetherby Wanderers')
      OR
      (home_team."name" = 'Wetherby Wanderers' AND away_team."name" = 'Ripon Cider Boys')
    )
  ORDER BY COALESCE(fixture."kickoffAt", fixture."date") ASC
  LIMIT 1
), target AS (
  SELECT
    candidate.*,
    CASE
      WHEN COALESCE(existing_charge."amountPence", 0) > 0
        THEN existing_charge."amountPence"
      WHEN COALESCE(wetherby_team."standardMatchFeePence", 0) > 0
        THEN wetherby_team."standardMatchFeePence"
      ELSE 4000
    END AS wetherby_fee_pence
  FROM candidate
  JOIN "Team" wetherby_team ON wetherby_team."id" = candidate.wetherby_id
  LEFT JOIN "PaymentCharge" existing_charge
    ON existing_charge."fixtureId" = candidate.fixture_id
   AND existing_charge."teamId" = candidate.wetherby_id
)
UPDATE "Fixture" fixture
SET
  "homeMatchFeePence" = CASE
    WHEN fixture."homeTeamId" = target.ripon_id THEN 0
    ELSE target.wetherby_fee_pence
  END,
  "awayMatchFeePence" = CASE
    WHEN fixture."awayTeamId" = target.ripon_id THEN 0
    ELSE target.wetherby_fee_pence
  END,
  "matchFeePence" = target.wetherby_fee_pence,
  "updatedAt" = NOW()
FROM target
WHERE fixture."id" = target.fixture_id;

-- 2. Re-open Wetherby's untouched fixture charge if the £0 edit merely voided
-- it. Any charge with real payment activity is left alone.
WITH candidate AS (
  SELECT
    fixture."id" AS fixture_id,
    fixture."leagueId" AS league_id,
    COALESCE(fixture."kickoffAt", fixture."date") AS kickoff_at,
    CASE
      WHEN home_team."name" = 'Wetherby Wanderers' THEN home_team."id"
      ELSE away_team."id"
    END AS wetherby_id
  FROM "Fixture" fixture
  JOIN "League" league ON league."id" = fixture."leagueId"
  JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
  JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
  WHERE league."name" = 'Harrogate Tuesday Mens'
    AND fixture."status" = 'SCHEDULED'
    AND COALESCE(fixture."kickoffAt", fixture."date") >= TIMESTAMP '2026-09-04 00:00:00'
    AND (
      (home_team."name" = 'Ripon Cider Boys' AND away_team."name" = 'Wetherby Wanderers')
      OR
      (home_team."name" = 'Wetherby Wanderers' AND away_team."name" = 'Ripon Cider Boys')
    )
  ORDER BY COALESCE(fixture."kickoffAt", fixture."date") ASC
  LIMIT 1
), target AS (
  SELECT
    candidate.*,
    CASE
      WHEN COALESCE(existing_charge."amountPence", 0) > 0
        THEN existing_charge."amountPence"
      WHEN COALESCE(wetherby_team."standardMatchFeePence", 0) > 0
        THEN wetherby_team."standardMatchFeePence"
      ELSE 4000
    END AS wetherby_fee_pence
  FROM candidate
  JOIN "Team" wetherby_team ON wetherby_team."id" = candidate.wetherby_id
  LEFT JOIN "PaymentCharge" existing_charge
    ON existing_charge."fixtureId" = candidate.fixture_id
   AND existing_charge."teamId" = candidate.wetherby_id
)
UPDATE "PaymentCharge" charge
SET
  "chargeType" = 'MATCH_FEE',
  "amountPence" = target.wetherby_fee_pence,
  "status" = 'OPEN',
  "dueDate" = target.kickoff_at,
  "leagueId" = target.league_id,
  "lastStripeCheckoutUrl" = NULL,
  "lastStripeCheckoutSessionId" = NULL,
  "lastStripeCheckoutCreatedAt" = NULL,
  "lastStripeCheckoutAmountPence" = NULL,
  "updatedAt" = NOW()
FROM target
WHERE charge."fixtureId" = target.fixture_id
  AND charge."teamId" = target.wetherby_id
  AND charge."status" IN ('OPEN', 'VOID')
  AND NOT EXISTS (
    SELECT 1
    FROM "PaymentTransaction" transaction
    WHERE transaction."chargeId" = charge."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "PlayerMatchFee" player_fee
    WHERE player_fee."fixtureId" = target.fixture_id
      AND player_fee."teamId" = target.wetherby_id
      AND player_fee."status" = 'PAID'
  );

-- 3. If Wetherby had no charge row at all, create the normal fixture charge.
WITH candidate AS (
  SELECT
    fixture."id" AS fixture_id,
    fixture."leagueId" AS league_id,
    COALESCE(fixture."kickoffAt", fixture."date") AS kickoff_at,
    CASE
      WHEN home_team."name" = 'Wetherby Wanderers' THEN home_team."id"
      ELSE away_team."id"
    END AS wetherby_id
  FROM "Fixture" fixture
  JOIN "League" league ON league."id" = fixture."leagueId"
  JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
  JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
  WHERE league."name" = 'Harrogate Tuesday Mens'
    AND fixture."status" = 'SCHEDULED'
    AND COALESCE(fixture."kickoffAt", fixture."date") >= TIMESTAMP '2026-09-04 00:00:00'
    AND (
      (home_team."name" = 'Ripon Cider Boys' AND away_team."name" = 'Wetherby Wanderers')
      OR
      (home_team."name" = 'Wetherby Wanderers' AND away_team."name" = 'Ripon Cider Boys')
    )
  ORDER BY COALESCE(fixture."kickoffAt", fixture."date") ASC
  LIMIT 1
), target AS (
  SELECT
    candidate.*,
    CASE
      WHEN COALESCE(wetherby_team."standardMatchFeePence", 0) > 0
        THEN wetherby_team."standardMatchFeePence"
      ELSE 4000
    END AS wetherby_fee_pence
  FROM candidate
  JOIN "Team" wetherby_team ON wetherby_team."id" = candidate.wetherby_id
)
INSERT INTO "PaymentCharge" (
  "id",
  "teamId",
  "fixtureId",
  "leagueId",
  "chargeType",
  "title",
  "amountPence",
  "status",
  "dueDate",
  "paymentToken",
  "createdAt",
  "updatedAt"
)
SELECT
  'repair_' || md5(target.fixture_id || ':' || target.wetherby_id || ':charge'),
  target.wetherby_id,
  target.fixture_id,
  target.league_id,
  'MATCH_FEE',
  'Match fee • Ripon Cider Boys vs Wetherby Wanderers',
  target.wetherby_fee_pence,
  'OPEN',
  target.kickoff_at,
  md5(target.fixture_id || ':' || target.wetherby_id || ':payment-a') ||
    substr(md5(target.fixture_id || ':' || target.wetherby_id || ':payment-b'), 1, 16),
  NOW(),
  NOW()
FROM target
WHERE NOT EXISTS (
  SELECT 1
  FROM "PaymentCharge" existing_charge
  WHERE existing_charge."fixtureId" = target.fixture_id
    AND existing_charge."teamId" = target.wetherby_id
);

-- 4. Ripon's side stays free. Void only an untouched charge and clear any
-- stale checkout metadata; paid money is never changed.
WITH target AS (
  SELECT
    fixture."id" AS fixture_id,
    CASE
      WHEN home_team."name" = 'Ripon Cider Boys' THEN home_team."id"
      ELSE away_team."id"
    END AS ripon_id
  FROM "Fixture" fixture
  JOIN "League" league ON league."id" = fixture."leagueId"
  JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
  JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
  WHERE league."name" = 'Harrogate Tuesday Mens'
    AND fixture."status" = 'SCHEDULED'
    AND COALESCE(fixture."kickoffAt", fixture."date") >= TIMESTAMP '2026-09-04 00:00:00'
    AND (
      (home_team."name" = 'Ripon Cider Boys' AND away_team."name" = 'Wetherby Wanderers')
      OR
      (home_team."name" = 'Wetherby Wanderers' AND away_team."name" = 'Ripon Cider Boys')
    )
  ORDER BY COALESCE(fixture."kickoffAt", fixture."date") ASC
  LIMIT 1
)
UPDATE "PaymentCharge" charge
SET
  "status" = 'VOID',
  "lastStripeCheckoutUrl" = NULL,
  "lastStripeCheckoutSessionId" = NULL,
  "lastStripeCheckoutCreatedAt" = NULL,
  "lastStripeCheckoutAmountPence" = NULL,
  "updatedAt" = NOW()
FROM target
WHERE charge."fixtureId" = target.fixture_id
  AND charge."teamId" = target.ripon_id
  AND charge."status" IN ('OPEN', 'VOID')
  AND NOT EXISTS (
    SELECT 1
    FROM "PaymentTransaction" transaction
    WHERE transaction."chargeId" = charge."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "PlayerMatchFee" player_fee
    WHERE player_fee."fixtureId" = target.fixture_id
      AND player_fee."teamId" = target.ripon_id
      AND player_fee."status" = 'PAID'
  );
