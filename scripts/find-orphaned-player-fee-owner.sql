-- Find likely original player details for orphaned PlayerMatchFee rows.
-- Use this in Railway Postgres when an admin card shows "Unnamed player" / "No contact".

SELECT
  pmf."id" AS "playerMatchFeeId",
  pmf."amountPence",
  pmf."status",
  pmf."createdAt" AS "feeCreatedAt",
  pmf."lastChasedAt",
  team."name" AS "teamName",
  home."name" AS "homeTeam",
  away."name" AS "awayTeam",
  fixture."kickoffAt",
  pmf."playerNameSnapshot",
  pmf."playerEmailSnapshot",
  pmf."playerPhoneSnapshot",
  latest_recipient."displayName" AS "notificationDisplayName",
  latest_recipient."email" AS "notificationEmail",
  latest_recipient."phone" AS "notificationPhone",
  latest_recipient."sentOrQueuedAt" AS "notificationSentOrQueuedAt"
FROM "PlayerMatchFee" pmf
JOIN "Team" team ON team."id" = pmf."teamId"
JOIN "Fixture" fixture ON fixture."id" = pmf."fixtureId"
JOIN "Team" home ON home."id" = fixture."homeTeamId"
JOIN "Team" away ON away."id" = fixture."awayTeamId"
LEFT JOIN LATERAL (
  SELECT
    nr."displayName",
    nr."email",
    nr."phone",
    COALESCE(nd."sentAt", nd."scheduledFor", nd."createdAt") AS "sentOrQueuedAt"
  FROM "NotificationDispatch" nd
  JOIN "NotificationRecipient" nr ON nr."id" = nd."recipientId"
  WHERE nd."sourceType" IN (
    'PLAYER_MATCH_FEE_REQUEST',
    'PLAYER_MATCH_FEE_CHASE_24H',
    'PLAYER_MATCH_FEE_CHASE_72H'
  )
    AND nd."sourceId" = pmf."id"
  ORDER BY COALESCE(nd."sentAt", nd."scheduledFor", nd."createdAt") DESC
  LIMIT 1
) latest_recipient ON TRUE
WHERE pmf."teamMemberId" IS NULL
  AND pmf."prospectId" IS NULL
ORDER BY fixture."kickoffAt" DESC, pmf."createdAt" DESC;
