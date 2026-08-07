-- A team may be set to "No league" while remaining affiliated to a parent
-- competition for communications. LeagueSeasonTeam controls participation;
-- Team.competitionId may therefore remain set even when Team.leagueId is NULL.
--
-- A previous repair cleared competitionId for every no-league team. Restore an
-- affiliation only when the team's historical season rows point unambiguously
-- to one parent competition. Do not reactivate any season membership.

WITH historical_competitions AS (
  SELECT
    t."id" AS "teamId",
    MIN(l."competitionId") AS "competitionId",
    COUNT(DISTINCT l."competitionId")::int AS "competitionCount"
  FROM "Team" t
  JOIN "LeagueSeasonTeam" lst ON lst."teamId" = t."id"
  JOIN "League" l ON l."id" = lst."leagueId"
  WHERE t."leagueId" IS NULL
    AND t."competitionId" IS NULL
    AND l."competitionId" IS NOT NULL
  GROUP BY t."id"
)
UPDATE "Team" t
SET
  "competitionId" = history."competitionId",
  "divisionId" = NULL,
  "updatedAt" = NOW()
FROM historical_competitions history
WHERE t."id" = history."teamId"
  AND history."competitionCount" = 1;

-- No-league teams are never active season participants, even when they remain
-- affiliated for email/communications purposes.
UPDATE "LeagueSeasonTeam" lst
SET
  "isActive" = FALSE,
  "divisionId" = NULL,
  "updatedAt" = NOW()
FROM "Team" t
WHERE lst."teamId" = t."id"
  AND t."leagueId" IS NULL
  AND (lst."isActive" = TRUE OR lst."divisionId" IS NOT NULL);
