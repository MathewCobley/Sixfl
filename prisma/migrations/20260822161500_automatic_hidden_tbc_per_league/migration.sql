-- Every active league season gets one hidden fixture-only TBC slot.
-- TBC is deliberately NOT assigned through Team.leagueId; it belongs to a
-- league only through LeagueSeasonTeam so it stays out of normal team admin,
-- tables, payment flows, captain access and communications.

-- First, if there is an orphan legacy TBC placeholder, reuse it for the current
-- Northallerton league. This preserves the existing placeholder identity the
-- admin was already trying to use instead of creating another Northallerton TBC.
WITH northallerton AS (
  SELECT l."id" AS "leagueId"
  FROM "League" l
  WHERE l."isActive" = true
    AND LOWER(l."name") LIKE 'northallerton%'
    AND NOT EXISTS (
      SELECT 1
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      WHERE lst."leagueId" = l."id"
        AND lst."isActive" = true
        AND COALESCE(t."isFixturePlaceholder", false) = true
    )
  ORDER BY l."season" DESC NULLS LAST, l."createdAt" DESC
  LIMIT 1
), orphan_tbc AS (
  SELECT t."id" AS "teamId"
  FROM "Team" t
  WHERE COALESCE(t."isFixturePlaceholder", false) = true
    AND LOWER(TRIM(t."name")) = 'tbc'
    AND NOT EXISTS (
      SELECT 1
      FROM "LeagueSeasonTeam" lst
      WHERE lst."teamId" = t."id"
        AND lst."isActive" = true
    )
  ORDER BY t."updatedAt" DESC, t."createdAt" DESC
  LIMIT 1
)
INSERT INTO "LeagueSeasonTeam" (
  "id",
  "leagueId",
  "teamId",
  "divisionId",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'lst_tbc_' || SUBSTRING(MD5(n."leagueId" || ':' || o."teamId") FROM 1 FOR 20),
  n."leagueId",
  o."teamId",
  NULL,
  true,
  NOW(),
  NOW()
FROM northallerton n
CROSS JOIN orphan_tbc o
ON CONFLICT ("leagueId", "teamId") DO UPDATE
SET
  "divisionId" = NULL,
  "isActive" = true,
  "updatedAt" = NOW();

-- Keep all placeholder rows detached from normal Team league/division fields.
UPDATE "Team"
SET
  "leagueId" = NULL,
  "divisionId" = NULL,
  "competitionId" = NULL,
  "isRecruiting" = false,
  "updatedAt" = NOW()
WHERE COALESCE("isFixturePlaceholder", false) = true;

-- Create a deterministic hidden TBC Team row for each active league that does
-- not already have an active placeholder membership.
INSERT INTO "Team" (
  "id",
  "name",
  "claimCode",
  "teamMode",
  "isRecruiting",
  "isFixturePlaceholder",
  "leagueId",
  "divisionId",
  "competitionId",
  "createdAt",
  "updatedAt"
)
SELECT
  'tbc_' || SUBSTRING(MD5(l."id") FROM 1 FOR 24),
  'TBC',
  'TBC-' || UPPER(SUBSTRING(MD5(l."id") FROM 1 FOR 12)),
  'STANDARD'::"TeamMode",
  false,
  true,
  NULL,
  NULL,
  NULL,
  NOW(),
  NOW()
FROM "League" l
WHERE l."isActive" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" existing_tbc ON existing_tbc."id" = lst."teamId"
    WHERE lst."leagueId" = l."id"
      AND lst."isActive" = true
      AND COALESCE(existing_tbc."isFixturePlaceholder", false) = true
  )
ON CONFLICT ("id") DO UPDATE
SET
  "name" = 'TBC',
  "isFixturePlaceholder" = true,
  "leagueId" = NULL,
  "divisionId" = NULL,
  "competitionId" = NULL,
  "teamMode" = 'STANDARD'::"TeamMode",
  "isRecruiting" = false,
  "updatedAt" = NOW();

-- Attach each deterministic TBC to its league season. The DB trigger still
-- guarantees that a league cannot have more than one active placeholder.
INSERT INTO "LeagueSeasonTeam" (
  "id",
  "leagueId",
  "teamId",
  "divisionId",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'lst_tbc_' || SUBSTRING(MD5(l."id") FROM 1 FOR 20),
  l."id",
  'tbc_' || SUBSTRING(MD5(l."id") FROM 1 FOR 24),
  NULL,
  true,
  NOW(),
  NOW()
FROM "League" l
WHERE l."isActive" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" existing_tbc ON existing_tbc."id" = lst."teamId"
    WHERE lst."leagueId" = l."id"
      AND lst."isActive" = true
      AND COALESCE(existing_tbc."isFixturePlaceholder", false) = true
  )
ON CONFLICT ("leagueId", "teamId") DO UPDATE
SET
  "divisionId" = NULL,
  "isActive" = true,
  "updatedAt" = NOW();