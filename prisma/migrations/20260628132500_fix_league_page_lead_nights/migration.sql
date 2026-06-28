-- Align existing leads created from league landing pages with the saved league night.

UPDATE "InterestLeadPreferredNight" ipn
SET "night" = l."dayOfWeek"
FROM "InterestLead" il
JOIN "League" l ON l."id" = il."leagueId"
WHERE ipn."leadId" = il."id"
  AND il."source" = 'league-page'
  AND l."dayOfWeek" IS NOT NULL
  AND ipn."night" <> l."dayOfWeek";
