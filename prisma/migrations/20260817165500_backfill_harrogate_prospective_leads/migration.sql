-- Website registrations use the customer-facing area "Harrogate", while the
-- operational league has historically used more specific Harrogate/Rossett
-- wording. Attach existing unassigned Harrogate Tuesday men's leads to the
-- current Rossett Tuesday league without overwriting any manual assignment.
WITH harrogate_league AS (
  SELECT league."id"
  FROM "League" league
  WHERE league."isActive" = TRUE
    AND league."slug" = 'rossett-mens-tuesday'
  ORDER BY league."createdAt" DESC
  LIMIT 1
)
UPDATE "InterestLead" AS lead
SET
  "leagueId" = harrogate_league."id",
  "updatedAt" = CURRENT_TIMESTAMP
FROM harrogate_league
WHERE lead."leagueId" IS NULL
  AND lead."interestType" IN ('TEAM', 'PLAYER')
  AND lead."leagueType" = 'MENS'
  AND LOWER(TRIM(COALESCE(lead."area", ''))) IN ('harrogate', 'harrogate west')
  AND EXISTS (
    SELECT 1
    FROM "InterestLeadPreferredNight" preferred_night
    WHERE preferred_night."leadId" = lead."id"
      AND preferred_night."night" = 'TUESDAY'
  );
