-- Backfill prospective league links for existing interest leads where there is exactly one active league match.
-- This only sets InterestLead.leagueId for planning/email context. It does not create teams or fixtures.

WITH lead_preferences AS (
  SELECT
    il."id" AS "leadId",
    il."area",
    il."leagueType",
    COALESCE(
      array_remove(array_agg(DISTINCT ipn."night"), NULL),
      ARRAY[]::"PreferredNight"[]
    ) AS "nights"
  FROM "InterestLead" il
  LEFT JOIN "InterestLeadPreferredNight" ipn ON ipn."leadId" = il."id"
  WHERE il."leagueId" IS NULL
    AND il."interestType" IN ('TEAM', 'PLAYER')
    AND il."area" IS NOT NULL
    AND il."leagueType" IS NOT NULL
  GROUP BY il."id", il."area", il."leagueType"
), possible_matches AS (
  SELECT
    lp."leadId",
    l."id" AS "leagueId"
  FROM lead_preferences lp
  JOIN "League" l ON l."isActive" = true
    AND l."leagueType" = lp."leagueType"
    AND lower(l."area") = lower(lp."area")
    AND (
      cardinality(lp."nights") = 0
      OR 'ANY'::"PreferredNight" = ANY(lp."nights")
      OR l."dayOfWeek" = ANY(lp."nights")
    )
), single_matches AS (
  SELECT
    "leadId",
    min("leagueId") AS "leagueId",
    count(*) AS "matchCount"
  FROM possible_matches
  GROUP BY "leadId"
)
UPDATE "InterestLead" il
SET "leagueId" = sm."leagueId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM single_matches sm
WHERE il."id" = sm."leadId"
  AND il."leagueId" IS NULL
  AND sm."matchCount" = 1;
