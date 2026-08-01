-- Player collection rows must never change the fixed amount charged to a team.
-- Restore every charge previously altered by the obsolete zero-fee adjustment
-- using the fixture's authoritative team-specific fee, then remove the generated
-- adjustment copy.

WITH affected_charges AS (
  SELECT
    charge."id",
    CASE
      WHEN charge."teamId" = fixture."homeTeamId" THEN COALESCE(
        fixture."homeMatchFeePence",
        fixture."matchFeePence",
        charge."amountPence"
      )
      WHEN charge."teamId" = fixture."awayTeamId" THEN COALESCE(
        fixture."awayMatchFeePence",
        fixture."matchFeePence",
        charge."amountPence"
      )
      ELSE charge."amountPence"
    END AS "expectedAmountPence"
  FROM "PaymentCharge" charge
  INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
  WHERE charge."description" ILIKE '%Zero-fee player waiver adjustment%'
)
UPDATE "PaymentCharge" charge
SET
  "amountPence" = affected_charges."expectedAmountPence",
  "description" = NULLIF(
    BTRIM(
      REGEXP_REPLACE(
        charge."description",
        E'(^|\\n)Zero-fee player waiver adjustment:[^\\n]*(\\n|$)',
        E'\\1',
        'gi'
      )
    ),
    ''
  ),
  "updatedAt" = NOW()
FROM affected_charges
WHERE charge."id" = affected_charges."id";

-- Cancel stale zero-fee player rows where the player no longer has an explicit
-- £0 admin override. These rows were created from the invalid override and must
-- not remain as hidden waived allocations in the collection summary.
WITH stale_rows AS (
  SELECT fee."id"
  FROM "PlayerMatchFee" fee
  WHERE fee."teamMemberId" IS NOT NULL
    AND fee."status" <> 'PAID'
    AND fee."note" ILIKE '%Zero-fee player share waived by SIXFL%'
    AND NOT EXISTS (
      SELECT 1
      FROM "TeamMemberProfile" profile
      WHERE profile."teamMemberId" = fee."teamMemberId"
        AND profile."playerMatchFeePenceOverride" = 0
    )
)
UPDATE "PlayerMatchFee" fee
SET
  "amountPence" = 0,
  "status" = 'CANCELLED',
  "paidAt" = NULL,
  "waivedAt" = NULL,
  "cancelledAt" = NOW(),
  "paymentUrl" = NULL,
  "paymentToken" = NULL,
  "note" = CONCAT_WS(
    E'\n',
    NULLIF(
      BTRIM(
        REGEXP_REPLACE(
          COALESCE(fee."note", ''),
          E'(^|\\n)Zero-fee player share waived by SIXFL:[^\\n]*(\\n|$)',
          E'\\1',
          'gi'
        )
      ),
      ''
    ),
    'Cancelled by system repair: the player no longer has a valid £0 admin fee override.'
  ),
  "updatedAt" = NOW()
FROM stale_rows
WHERE fee."id" = stale_rows."id";
