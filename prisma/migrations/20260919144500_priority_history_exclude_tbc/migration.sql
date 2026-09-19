-- Remove placeholder/TBC rows already captured in Priority history.
DELETE FROM "SixflTvPriorityWeeklySnapshot" s
WHERE UPPER(BTRIM(s."teamName")) ~ '^TBC([[:space:]_-]|$)'
   OR EXISTS (
     SELECT 1
     FROM "Team" t
     WHERE t."id" = s."teamId"
       AND COALESCE(t."isFixturePlaceholder", false) = true
   );
