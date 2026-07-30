-- Taking Part FC was assigned a primary/current league before the team form
-- synchronised LeagueSeasonTeam membership. Repair this one existing record
-- without changing any affiliated-only teams.

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
  'lst_repair_' || md5(t."id" || ':' || t."leagueId"),
  t."leagueId",
  t."id",
  t."divisionId",
  true,
  NOW(),
  NOW()
FROM "Team" t
WHERE t."id" = 'cms7frree001to33io7em01ka'
  AND t."leagueId" IS NOT NULL
ON CONFLICT ("leagueId", "teamId") DO UPDATE
SET
  "isActive" = true,
  "divisionId" = COALESCE("LeagueSeasonTeam"."divisionId", EXCLUDED."divisionId"),
  "updatedAt" = NOW();
