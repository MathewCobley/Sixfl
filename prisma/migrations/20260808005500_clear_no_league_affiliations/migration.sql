-- Team.leagueId = NULL is the explicit "No league" state.
-- Older admin/migration paths could leave competitionId or active season rows behind,
-- which made teams such as Six Offenders appear under "Affiliated teams not in this season".
-- Keep the no-league state authoritative and remove only stale affiliation metadata.

UPDATE "LeagueSeasonTeam" lst
SET
  "isActive" = FALSE,
  "divisionId" = NULL,
  "updatedAt" = NOW()
FROM "Team" team
WHERE lst."teamId" = team."id"
  AND team."leagueId" IS NULL
  AND lst."isActive" = TRUE;

UPDATE "Team"
SET
  "competitionId" = NULL,
  "divisionId" = NULL,
  "updatedAt" = NOW()
WHERE "leagueId" IS NULL
  AND ("competitionId" IS NOT NULL OR "divisionId" IS NOT NULL);
