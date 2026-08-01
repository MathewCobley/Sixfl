-- Restricting fee overrides is enforced in application code.
-- This migration creates the permanent audit trail and clears the unverified
-- override currently stored for Al Senzo Shem at Crescent United.

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
  CONSTRAINT "TeamMemberFeeOverrideAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamMemberFeeOverrideAudit_teamMemberId_fkey"
    FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamMemberFeeOverrideAudit_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamMemberFeeOverrideAudit_changedByUserId_fkey"
    FOREIGN KEY ("changedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TeamMemberFeeOverrideAudit_teamMemberId_changedAt_idx"
  ON "TeamMemberFeeOverrideAudit"("teamMemberId", "changedAt" DESC);

CREATE INDEX IF NOT EXISTS "TeamMemberFeeOverrideAudit_teamId_changedAt_idx"
  ON "TeamMemberFeeOverrideAudit"("teamId", "changedAt" DESC);

WITH targets AS (
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
    AND profile."playerMatchFeePenceOverride" IS NOT NULL
),
audit_rows AS (
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
    MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text || targets."profileId"),
    targets."teamMemberId",
    targets."teamId",
    targets."oldAmountPence",
    NULL,
    NULL,
    NULL,
    'SYSTEM_REPAIR',
    'Cleared unverified player fee override after automatic ledger reconciliation incident',
    NOW()
  FROM targets
  RETURNING "teamMemberId"
)
UPDATE "TeamMemberProfile" profile
SET
  "playerMatchFeePenceOverride" = NULL,
  "updatedAt" = NOW()
FROM targets
WHERE profile."id" = targets."profileId";
