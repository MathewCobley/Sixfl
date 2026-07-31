-- Restore SWAZ using the existing Championship membership itself as the source
-- of truth. This avoids relying on a particular league/competition display name.
-- The migration is deliberately a no-op rather than a failure if the expected
-- records cannot be identified, so it can never block production migrations.

WITH target_membership AS (
  SELECT
    lst."leagueId",
    lst."divisionId",
    COUNT(*)::INTEGER AS "matchingTeams"
  FROM "LeagueSeasonTeam" lst
  INNER JOIN "LeagueDivision" d
    ON d."id" = lst."divisionId"
   AND d."leagueId" = lst."leagueId"
  INNER JOIN "Team" t
    ON t."id" = lst."teamId"
  WHERE lst."isActive" = TRUE
    AND d."isActive" = TRUE
    AND LOWER(TRIM(d."name")) = 'championship'
    AND REGEXP_REPLACE(LOWER(TRIM(t."name")), '[^a-z0-9]+', '', 'g') IN (
      'wetherbywanderers',
      'rossettvets',
      'dynamokebab',
      'wenlockwarriors'
    )
  GROUP BY lst."leagueId", lst."divisionId"
  HAVING COUNT(*) >= 3
  ORDER BY COUNT(*) DESC
  LIMIT 1
),
swaz_team AS (
  SELECT t."id" AS "teamId"
  FROM "Team" t
  CROSS JOIN target_membership target
  LEFT JOIN "LeagueSeasonTeam" current_membership
    ON current_membership."teamId" = t."id"
   AND current_membership."leagueId" = target."leagueId"
  WHERE REGEXP_REPLACE(LOWER(TRIM(t."name")), '[^a-z0-9]+', '', 'g')
        IN ('swaz', 'swazfc')
  ORDER BY
    CASE WHEN current_membership."id" IS NOT NULL THEN 0 ELSE 1 END,
    t."updatedAt" DESC
  LIMIT 1
),
deactivated_stale_memberships AS (
  UPDATE "LeagueSeasonTeam" lst
  SET
    "isActive" = FALSE,
    "divisionId" = NULL,
    "updatedAt" = NOW()
  FROM swaz_team swaz, target_membership target
  WHERE lst."teamId" = swaz."teamId"
    AND lst."leagueId" <> target."leagueId"
    AND lst."isActive" = TRUE
  RETURNING lst."id"
),
restored_membership AS (
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
    'lst_swaz_repair_' || MD5(swaz."teamId" || ':' || target."leagueId"),
    target."leagueId",
    swaz."teamId",
    target."divisionId",
    TRUE,
    NOW(),
    NOW()
  FROM swaz_team swaz
  CROSS JOIN target_membership target
  ON CONFLICT ("leagueId", "teamId") DO UPDATE
  SET
    "divisionId" = EXCLUDED."divisionId",
    "isActive" = TRUE,
    "updatedAt" = NOW()
  RETURNING "teamId", "leagueId", "divisionId"
)
UPDATE "Team" t
SET
  "leagueId" = restored."leagueId",
  "divisionId" = restored."divisionId",
  "updatedAt" = NOW()
FROM restored_membership restored
WHERE t."id" = restored."teamId";
