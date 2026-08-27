-- Repair the two legacy capped Dynamo Kebab player-fee rows from the
-- 25 Aug 2026 fixture against Wenlock Warriors.
--
-- The captain allocated £8.00 to these players, but before the durable
-- captainAssignedAmountPence field existed the capped £5.00 amount became the
-- only surviving value. Do not change the real amount charged/paid: only
-- restore the captain-facing allocation used for display and fixture coverage.
WITH target_fees AS (
  SELECT pmf."id"
  FROM "PlayerMatchFee" pmf
  JOIN "Fixture" f ON f."id" = pmf."fixtureId"
  JOIN "Team" fee_team ON fee_team."id" = pmf."teamId"
  JOIN "Team" home_team ON home_team."id" = f."homeTeamId"
  JOIN "Team" away_team ON away_team."id" = f."awayTeamId"
  JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = pmf."teamMemberId"
  WHERE fee_team."name" = 'Dynamo Kebab'
    AND home_team."name" = 'Dynamo Kebab'
    AND away_team."name" = 'Wenlock Warriors'
    AND f."kickoffAt" >= TIMESTAMP '2026-08-25 00:00:00'
    AND f."kickoffAt" < TIMESTAMP '2026-08-26 00:00:00'
    AND pmf."amountPence" = 500
    AND pmf."captainAssignedAmountPence" = 500
    AND profile."playerMatchFeeCapPence" = 500
    AND pmf."status"::text IN ('OPEN', 'PAID')
)
UPDATE "PlayerMatchFee" pmf
SET
  "captainAssignedAmountPence" = 800,
  "note" = CASE
    WHEN COALESCE(pmf."note", '') ~* 'Player fee cap applied:'
      THEN REGEXP_REPLACE(
        pmf."note",
        'Player fee cap applied:[^\r\n]*',
        'Player fee cap applied: captain share £8.00; player charged £5.00.',
        'i'
      )
    WHEN NULLIF(BTRIM(COALESCE(pmf."note", '')), '') IS NULL
      THEN 'Player fee cap applied: captain share £8.00; player charged £5.00.'
    ELSE pmf."note" || E'\nPlayer fee cap applied: captain share £8.00; player charged £5.00.'
  END
FROM target_fees target
WHERE pmf."id" = target."id";
