ALTER TABLE "PlayerMatchFee"
  ADD COLUMN IF NOT EXISTS "playerNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "playerEmailSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "playerPhoneSnapshot" TEXT;

-- Backfill from still-linked squad members.
UPDATE "PlayerMatchFee" pmf
SET
  "playerNameSnapshot" = COALESCE(NULLIF(TRIM(u."name"), ''), u."email", pmf."playerNameSnapshot"),
  "playerEmailSnapshot" = COALESCE(u."email", pmf."playerEmailSnapshot")
FROM "TeamMember" tm
JOIN "User" u ON u."id" = tm."userId"
WHERE pmf."teamMemberId" = tm."id"
  AND (pmf."playerNameSnapshot" IS NULL OR pmf."playerEmailSnapshot" IS NULL);

-- Backfill from still-linked prospects.
UPDATE "PlayerMatchFee" pmf
SET
  "playerNameSnapshot" = COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', p."firstName", p."lastName")), ''),
    p."email",
    p."phone",
    pmf."playerNameSnapshot"
  ),
  "playerEmailSnapshot" = COALESCE(p."email", pmf."playerEmailSnapshot"),
  "playerPhoneSnapshot" = COALESCE(p."phone", pmf."playerPhoneSnapshot")
FROM "TeamPlayerProspect" p
WHERE pmf."prospectId" = p."id"
  AND (
    pmf."playerNameSnapshot" IS NULL OR
    pmf."playerEmailSnapshot" IS NULL OR
    pmf."playerPhoneSnapshot" IS NULL
  );

-- Recover orphaned fees from old player-fee notification recipients where possible.
WITH latest_dispatch AS (
  SELECT DISTINCT ON (nd."sourceId")
    nd."sourceId" AS "feeId",
    nr."displayName",
    nr."email",
    nr."phone"
  FROM "NotificationDispatch" nd
  JOIN "NotificationRecipient" nr ON nr."id" = nd."recipientId"
  WHERE nd."sourceType" IN (
    'PLAYER_MATCH_FEE_REQUEST',
    'PLAYER_MATCH_FEE_CHASE_24H',
    'PLAYER_MATCH_FEE_CHASE_72H'
  )
  ORDER BY nd."sourceId", COALESCE(nd."sentAt", nd."scheduledFor", nd."createdAt") DESC
)
UPDATE "PlayerMatchFee" pmf
SET
  "playerNameSnapshot" = COALESCE(NULLIF(TRIM(latest_dispatch."displayName"), ''), latest_dispatch."email", latest_dispatch."phone", pmf."playerNameSnapshot"),
  "playerEmailSnapshot" = COALESCE(latest_dispatch."email", pmf."playerEmailSnapshot"),
  "playerPhoneSnapshot" = COALESCE(latest_dispatch."phone", pmf."playerPhoneSnapshot")
FROM latest_dispatch
WHERE latest_dispatch."feeId" = pmf."id"
  AND (
    pmf."playerNameSnapshot" IS NULL OR
    pmf."playerEmailSnapshot" IS NULL OR
    pmf."playerPhoneSnapshot" IS NULL
  );

CREATE INDEX IF NOT EXISTS "PlayerMatchFee_playerNameSnapshot_idx" ON "PlayerMatchFee"("playerNameSnapshot");
CREATE INDEX IF NOT EXISTS "PlayerMatchFee_playerEmailSnapshot_idx" ON "PlayerMatchFee"("playerEmailSnapshot");
