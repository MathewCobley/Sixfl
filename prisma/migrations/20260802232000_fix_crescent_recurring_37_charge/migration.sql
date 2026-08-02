-- The Crescent United charge was repeatedly reduced from £40 to £37 because an
-- old £0-player reconciliation treated Al Senzo Shem's £3 squad share as a
-- discount from SIXFL's fixed team fixture fee. Player collection choices must
-- never alter the amount charged to the team.

CREATE TABLE IF NOT EXISTS "TeamMemberFeeOverrideAudit" (
  "id" TEXT NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "oldAmountPence" INTEGER,
  "newAmountPence" INTEGER,
  "changedByUserId" TEXT,
  "changedByEmail" TEXT,
  "source" TEXT NOT NULL,
  "reason" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMemberFeeOverrideAudit_pkey" PRIMARY KEY ("id")
);

-- Clear the unverified £0 override if it is still present. This is idempotent and
-- records the repair once.
WITH target_override AS (
  SELECT
    profile."id" AS "profileId",
    profile."teamMemberId",
    member."teamId",
    profile."playerMatchFeePenceOverride" AS "oldAmountPence"
  FROM "TeamMemberProfile" profile
  INNER JOIN "TeamMember" member ON member."id" = profile."teamMemberId"
  INNER JOIN "User" player_user ON player_user."id" = member."userId"
  INNER JOIN "Team" team ON team."id" = member."teamId"
  WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE(player_user."name", '')), '[[:space:]]+', ' ', 'g')) = 'al senzo shem'
    AND LOWER(REGEXP_REPLACE(BTRIM(team."name"), '[[:space:]]+', ' ', 'g')) = 'crescent united'
    AND profile."playerMatchFeePenceOverride" = 0
),
audit_insert AS (
  INSERT INTO "TeamMemberFeeOverrideAudit" (
    "id",
    "teamMemberId",
    "teamId",
    "oldAmountPence",
    "newAmountPence",
    "changedByUserId",
    "changedByEmail",
    "source",
    "reason",
    "changedAt"
  )
  SELECT
    MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text || target_override."profileId"),
    target_override."teamMemberId",
    target_override."teamId",
    target_override."oldAmountPence",
    NULL,
    NULL,
    NULL,
    'SYSTEM_REPAIR',
    'Removed unverified £0 override that was repeatedly reducing Crescent United fixture charges',
    NOW()
  FROM target_override
  RETURNING "teamMemberId"
)
UPDATE "TeamMemberProfile" profile
SET
  "playerMatchFeePenceOverride" = NULL,
  "updatedAt" = NOW()
FROM target_override
WHERE profile."id" = target_override."profileId";

-- Cancel the stale no-charge row produced by that override. It remains visible in
-- history as cancelled rather than silently disappearing.
UPDATE "PlayerMatchFee" fee
SET
  "amountPence" = 0,
  "status" = 'CANCELLED'::"PlayerMatchFeeStatus",
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
    'Cancelled by system repair: this player was not authorised as a no-charge player.'
  ),
  "updatedAt" = NOW()
FROM "TeamMember" member,
     "User" player_user,
     "Team" team
WHERE fee."teamMemberId" = member."id"
  AND member."userId" = player_user."id"
  AND member."teamId" = team."id"
  AND fee."status" <> 'PAID'
  AND fee."note" ILIKE '%Zero-fee player share waived by SIXFL%'
  AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE(player_user."name", '')), '[[:space:]]+', ' ', 'g')) = 'al senzo shem'
  AND LOWER(REGEXP_REPLACE(BTRIM(team."name"), '[[:space:]]+', ' ', 'g')) = 'crescent united';

-- Restore the authoritative team-specific fixture fee to £40 for the affected
-- Crescent United v What a Struijk fixture if the bad £37 value was copied back
-- onto the fixture itself.
UPDATE "Fixture" fixture
SET
  "homeMatchFeePence" = 4000,
  "updatedAt" = NOW()
FROM "Team" home_team,
     "Team" away_team
WHERE fixture."homeTeamId" = home_team."id"
  AND fixture."awayTeamId" = away_team."id"
  AND LOWER(REGEXP_REPLACE(BTRIM(home_team."name"), '[[:space:]]+', ' ', 'g')) = 'crescent united'
  AND LOWER(REGEXP_REPLACE(BTRIM(away_team."name"), '[[:space:]]+', ' ', 'g')) = 'what a struijk'
  AND fixture."homeMatchFeePence" = 3700;

UPDATE "Fixture" fixture
SET
  "awayMatchFeePence" = 4000,
  "updatedAt" = NOW()
FROM "Team" home_team,
     "Team" away_team
WHERE fixture."homeTeamId" = home_team."id"
  AND fixture."awayTeamId" = away_team."id"
  AND LOWER(REGEXP_REPLACE(BTRIM(home_team."name"), '[[:space:]]+', ' ', 'g')) = 'what a struijk'
  AND LOWER(REGEXP_REPLACE(BTRIM(away_team."name"), '[[:space:]]+', ' ', 'g')) = 'crescent united'
  AND fixture."awayMatchFeePence" = 3700;

-- Restore the active Crescent United payment charge itself to £40 and recalculate
-- its stored status from actual direct and player payments.
WITH target_charges AS (
  SELECT
    charge."id",
    COALESCE((
      SELECT SUM(transaction_row."amountPence")
      FROM "PaymentTransaction" transaction_row
      WHERE transaction_row."chargeId" = charge."id"
    ), 0) + COALESCE((
      SELECT SUM(player_fee."amountPence")
      FROM "PlayerMatchFee" player_fee
      WHERE player_fee."teamId" = charge."teamId"
        AND player_fee."fixtureId" = charge."fixtureId"
        AND player_fee."status" = 'PAID'
    ), 0) AS "paidAmountPence"
  FROM "PaymentCharge" charge
  INNER JOIN "Team" charged_team ON charged_team."id" = charge."teamId"
  INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
  INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
  INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
  WHERE charge."status" <> 'VOID'
    AND charge."amountPence" = 3700
    AND LOWER(REGEXP_REPLACE(BTRIM(charged_team."name"), '[[:space:]]+', ' ', 'g')) = 'crescent united'
    AND (
      LOWER(REGEXP_REPLACE(BTRIM(home_team."name"), '[[:space:]]+', ' ', 'g')) = 'what a struijk'
      OR LOWER(REGEXP_REPLACE(BTRIM(away_team."name"), '[[:space:]]+', ' ', 'g')) = 'what a struijk'
    )
)
UPDATE "PaymentCharge" charge
SET
  "amountPence" = 4000,
  "status" = CASE
    WHEN target_charges."paidAmountPence" <= 0 THEN 'OPEN'::"PaymentChargeStatus"
    WHEN target_charges."paidAmountPence" >= 4000 THEN 'PAID'::"PaymentChargeStatus"
    ELSE 'PART_PAID'::"PaymentChargeStatus"
  END,
  "description" = NULLIF(
    BTRIM(
      REGEXP_REPLACE(
        COALESCE(charge."description", ''),
        E'(^|\\n)Zero-fee player waiver adjustment:[^\\n]*(\\n|$)',
        E'\\1',
        'gi'
      )
    ),
    ''
  ),
  "updatedAt" = NOW()
FROM target_charges
WHERE charge."id" = target_charges."id";
