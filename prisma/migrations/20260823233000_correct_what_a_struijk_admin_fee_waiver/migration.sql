-- Correct the 04 Aug 2026 What a Struijk vs Reece's Set Pieces charge after the
-- legacy "reduce/waive" control changed the wrong component.
--
-- Confirmed intended accounting:
--   base match fee: £40
--   late-payment admin fee: £10, waived by SIXFL
--   amount due after waiver: £40
--   team payment already received: £40
--   outstanding: £0
--
-- Match by the actual teams and fixture date rather than by the mutable charge
-- title/amount, so this repair cannot miss the row because earlier code altered it.
WITH target AS (
  SELECT
    charge."id" AS "chargeId",
    charge."fixtureId" AS "fixtureId",
    charge."teamId" AS "teamId"
  FROM "PaymentCharge" charge
  INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
  INNER JOIN "Team" charged_team ON charged_team."id" = charge."teamId"
  INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
  INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
  WHERE LOWER(TRIM(charged_team."name")) = LOWER('What a Struijk')
    AND (fixture."kickoffAt" AT TIME ZONE 'Europe/London')::date = DATE '2026-08-04'
    AND (
      (LOWER(TRIM(home_team."name")) = LOWER('What a Struijk') AND LOWER(TRIM(away_team."name")) = LOWER('Reece''s Set Pieces'))
      OR
      (LOWER(TRIM(away_team."name")) = LOWER('What a Struijk') AND LOWER(TRIM(home_team."name")) = LOWER('Reece''s Set Pieces'))
    )
    AND charge."latePaymentFeeAmountPence" = 1000
)
UPDATE "Fixture" fixture
SET
  "homeMatchFeePence" = CASE
    WHEN fixture."homeTeamId" = target."teamId" THEN 4000
    ELSE fixture."homeMatchFeePence"
  END,
  "awayMatchFeePence" = CASE
    WHEN fixture."awayTeamId" = target."teamId" THEN 4000
    ELSE fixture."awayMatchFeePence"
  END,
  "updatedAt" = NOW()
FROM target
WHERE fixture."id" = target."fixtureId";

WITH target AS (
  SELECT
    charge."id" AS "chargeId",
    COALESCE(SUM(transaction."amountPence"), 0)::int AS "paidPence"
  FROM "PaymentCharge" charge
  INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
  INNER JOIN "Team" charged_team ON charged_team."id" = charge."teamId"
  INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
  INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
  LEFT JOIN "PaymentTransaction" transaction ON transaction."chargeId" = charge."id"
  WHERE LOWER(TRIM(charged_team."name")) = LOWER('What a Struijk')
    AND (fixture."kickoffAt" AT TIME ZONE 'Europe/London')::date = DATE '2026-08-04'
    AND (
      (LOWER(TRIM(home_team."name")) = LOWER('What a Struijk') AND LOWER(TRIM(away_team."name")) = LOWER('Reece''s Set Pieces'))
      OR
      (LOWER(TRIM(away_team."name")) = LOWER('What a Struijk') AND LOWER(TRIM(home_team."name")) = LOWER('Reece''s Set Pieces'))
    )
    AND charge."latePaymentFeeAmountPence" = 1000
  GROUP BY charge."id"
)
UPDATE "PaymentCharge" charge
SET
  "amountPence" = 4000,
  "status" = CASE
    WHEN target."paidPence" >= 4000 THEN 'PAID'::"PaymentChargeStatus"
    WHEN target."paidPence" > 0 THEN 'PART_PAID'::"PaymentChargeStatus"
    ELSE 'OPEN'::"PaymentChargeStatus"
  END,
  "latePaymentFeeStatus" = 'WAIVED'::"PaymentLateFeeStatus",
  "latePaymentFeeNote" = CASE
    WHEN COALESCE(charge."latePaymentFeeNote", '') ILIKE '%base match fee remained £40%'
      THEN charge."latePaymentFeeNote"
    ELSE CONCAT_WS(
      E'\n',
      NULLIF(charge."latePaymentFeeNote", ''),
      'Corrected by SIXFL: £10 late-payment admin fee waived; original base match fee remained £40.'
    )
  END,
  "latePaymentFeeWaivedAt" = COALESCE(charge."latePaymentFeeWaivedAt", NOW()),
  "lastStripeCheckoutUrl" = NULL,
  "lastStripeCheckoutSessionId" = NULL,
  "lastStripeCheckoutCreatedAt" = NULL,
  "lastStripeCheckoutAmountPence" = NULL,
  "updatedAt" = NOW()
FROM target
WHERE charge."id" = target."chargeId";