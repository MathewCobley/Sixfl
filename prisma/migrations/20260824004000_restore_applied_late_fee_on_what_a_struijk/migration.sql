-- Final corrective repair for the 04 Aug 2026 What a Struijk / Reece's Set Pieces
-- payment record.
--
-- The confirmed accounting is:
--   base match fee              £40
--   applied late-payment fee    £10
--   total charge                £50
--   cash already received       £40
--   outstanding                 £10
--
-- A legacy path left PaymentCharge.amountPence at £40 while the late-fee status
-- remained APPLIED. Captain Payments therefore inferred an incorrect £30 base by
-- subtracting the £10 fee from the stale £40 total.
--
-- Match this historical row by date, league and charge title, without depending on
-- current team names (the fixture/team labels have changed since the match).
WITH target AS (
  SELECT
    charge."id" AS "chargeId",
    charge."fixtureId" AS "fixtureId",
    charge."teamId" AS "teamId",
    COALESCE(SUM(transaction."amountPence"), 0)::int AS "paidPence"
  FROM "PaymentCharge" charge
  INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
  INNER JOIN "League" league ON league."id" = fixture."leagueId"
  LEFT JOIN "PaymentTransaction" transaction ON transaction."chargeId" = charge."id"
  WHERE (fixture."kickoffAt" AT TIME ZONE 'Europe/London')::date = DATE '2026-08-04'
    AND league."name" ILIKE '%Harrogate West Tuesday Rossett%'
    AND charge."title" ILIKE '%What a Struijk%Reece%Set Pieces%'
    AND charge."latePaymentFeeAmountPence" = 1000
  GROUP BY charge."id", charge."fixtureId", charge."teamId"
),
fixture_target AS (
  SELECT
    target.*,
    fixture."homeTeamId",
    fixture."awayTeamId",
    home_team."name" AS "homeTeamName",
    away_team."name" AS "awayTeamName"
  FROM target
  INNER JOIN "Fixture" fixture ON fixture."id" = target."fixtureId"
  INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
  INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
)
UPDATE "Fixture" fixture
SET
  "homeMatchFeePence" = CASE
    WHEN fixture."homeTeamId" = fixture_target."teamId" THEN 4000
    -- The historical charge title names What a Struijk first; if the team row was
    -- subsequently renamed/relinked, the current fixture still shows Reece's Set
    -- Pieces as the other side. Restore the non-Reece's side to the confirmed £40.
    WHEN fixture_target."awayTeamName" ILIKE 'Reece%Set Pieces' THEN 4000
    ELSE fixture."homeMatchFeePence"
  END,
  "awayMatchFeePence" = CASE
    WHEN fixture."awayTeamId" = fixture_target."teamId" THEN 4000
    WHEN fixture_target."homeTeamName" ILIKE 'Reece%Set Pieces' THEN 4000
    ELSE fixture."awayMatchFeePence"
  END,
  "updatedAt" = NOW()
FROM fixture_target
WHERE fixture."id" = fixture_target."fixtureId";

WITH target AS (
  SELECT
    charge."id" AS "chargeId",
    COALESCE(SUM(transaction."amountPence"), 0)::int AS "paidPence"
  FROM "PaymentCharge" charge
  INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
  INNER JOIN "League" league ON league."id" = fixture."leagueId"
  LEFT JOIN "PaymentTransaction" transaction ON transaction."chargeId" = charge."id"
  WHERE (fixture."kickoffAt" AT TIME ZONE 'Europe/London')::date = DATE '2026-08-04'
    AND league."name" ILIKE '%Harrogate West Tuesday Rossett%'
    AND charge."title" ILIKE '%What a Struijk%Reece%Set Pieces%'
    AND charge."latePaymentFeeAmountPence" = 1000
  GROUP BY charge."id"
)
UPDATE "PaymentCharge" charge
SET
  "amountPence" = 5000,
  "status" = CASE
    WHEN target."paidPence" >= 5000 THEN 'PAID'::"PaymentChargeStatus"
    WHEN target."paidPence" > 0 THEN 'PART_PAID'::"PaymentChargeStatus"
    ELSE 'OPEN'::"PaymentChargeStatus"
  END,
  "latePaymentFeeStatus" = 'APPLIED'::"PaymentLateFeeStatus",
  "latePaymentFeeAppliedAt" = COALESCE(charge."latePaymentFeeAppliedAt", NOW()),
  "latePaymentFeeWaivedAt" = NULL,
  "latePaymentFeeNote" = NULLIF(
    TRIM(
      REPLACE(
        COALESCE(charge."latePaymentFeeNote", ''),
        'Corrected by SIXFL: £10 late-payment admin fee waived; original base match fee remained £40.',
        ''
      )
    ),
    ''
  ),
  "lastStripeCheckoutUrl" = NULL,
  "lastStripeCheckoutSessionId" = NULL,
  "lastStripeCheckoutCreatedAt" = NULL,
  "lastStripeCheckoutAmountPence" = NULL,
  "updatedAt" = NOW()
FROM target
WHERE charge."id" = target."chargeId";
