-- Read-only audit for suspected duplicate Team rows after season/division migration.
-- This does not update or delete data.
-- Run against production with psql or a database console before any merge/migration.

WITH team_context AS (
  SELECT
    t."id",
    t."name",
    lower(regexp_replace(trim(t."name"), '\s+', ' ', 'g')) AS "duplicateKey",
    t."leagueId",
    l."name" AS "leagueName",
    l."season" AS "leagueSeason",
    t."divisionId",
    d."name" AS "divisionName",
    COALESCE(t."competitionId", l."competitionId") AS "competitionId",
    c."name" AS "competitionName",
    t."contactEmail",
    t."contactPhone",
    t."captainUserId",
    t."captainLinkedAt",
    t."captainClaimedAt",
    t."createdAt",
    t."updatedAt",
    (SELECT COUNT(*) FROM "TeamMember" tm WHERE tm."teamId" = t."id") AS "teamMemberCount",
    (SELECT COUNT(*) FROM "TeamPlayerProspect" tp WHERE tp."teamId" = t."id") AS "prospectCount",
    (SELECT COUNT(*) FROM "Fixture" f WHERE f."homeTeamId" = t."id" OR f."awayTeamId" = t."id") AS "fixtureCount",
    (SELECT COUNT(*) FROM "PaymentCharge" pc WHERE pc."teamId" = t."id") AS "paymentChargeCount",
    (SELECT COUNT(*) FROM "PaymentTransaction" pt WHERE pt."teamId" = t."id") AS "paymentTransactionCount",
    (SELECT COUNT(*) FROM "PlayerMatchFee" pmf WHERE pmf."teamId" = t."id") AS "playerMatchFeeCount",
    (SELECT COUNT(*) FROM "FixtureCaptainConfirmation" fcc WHERE fcc."teamId" = t."id") AS "fixtureCaptainConfirmationCount",
    (SELECT COUNT(*) FROM "MessageThread" mt WHERE mt."teamId" = t."id") AS "messageThreadCount",
    (SELECT COUNT(*) FROM "MatchResultTeamMeta" meta WHERE meta."teamId" = t."id") AS "resultMetaCount",
    (SELECT COUNT(*) FROM "ResultDispute" rd WHERE rd."teamId" = t."id") AS "resultDisputeCount",
    (SELECT COUNT(*) FROM "LeagueSeasonTeam" lst WHERE lst."teamId" = t."id") AS "leagueSeasonTeamCount",
    (
      SELECT string_agg(
        concat_ws(' / ', sl."name", sl."season", sd."name"),
        ' | '
        ORDER BY sl."name", sl."season", sd."sortOrder", sd."name"
      )
      FROM "LeagueSeasonTeam" lst
      JOIN "League" sl ON sl."id" = lst."leagueId"
      LEFT JOIN "LeagueDivision" sd ON sd."id" = lst."divisionId"
      WHERE lst."teamId" = t."id"
    ) AS "leagueSeasonTeamEntries"
  FROM "Team" t
  LEFT JOIN "League" l ON l."id" = t."leagueId"
  LEFT JOIN "LeagueDivision" d ON d."id" = t."divisionId"
  LEFT JOIN "LeagueCompetition" c ON c."id" = COALESCE(t."competitionId", l."competitionId")
),
duplicate_keys AS (
  SELECT "duplicateKey"
  FROM team_context
  GROUP BY "duplicateKey"
  HAVING COUNT(*) > 1
)
SELECT
  *,
  (
    "teamMemberCount" * 1000 +
    "prospectCount" * 200 +
    "fixtureCount" * 100 +
    "paymentChargeCount" * 50 +
    "paymentTransactionCount" * 50 +
    "playerMatchFeeCount" * 25 +
    "leagueSeasonTeamCount" * 20 +
    CASE WHEN "captainClaimedAt" IS NOT NULL THEN 500 ELSE 0 END +
    CASE WHEN "captainUserId" IS NOT NULL THEN 250 ELSE 0 END
  ) AS "suggestedCanonicalScore"
FROM team_context
WHERE "duplicateKey" IN (SELECT "duplicateKey" FROM duplicate_keys)
ORDER BY
  "duplicateKey",
  "suggestedCanonicalScore" DESC,
  "teamMemberCount" DESC,
  "prospectCount" DESC,
  "fixtureCount" DESC,
  "createdAt" ASC;
