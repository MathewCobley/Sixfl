-- Ensure the live Harrogate Rossett Tuesday league uses the deployed 512px shield badge.
-- This is a safe data update only; it does not delete or reset any records.
UPDATE "League"
SET "badgeUrl" = '/leagues/harrogate-tuesday-mens-rossett-512.png'
WHERE LOWER("name") LIKE '%harrogate%'
  AND LOWER("name") LIKE '%rossett%'
  AND LOWER("name") LIKE '%tuesday%';
