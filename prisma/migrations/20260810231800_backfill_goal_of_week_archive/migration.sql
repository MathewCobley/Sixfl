-- Older Goal of the Week entries could be saved before archive publishing was
-- introduced, leaving publishedAt NULL even though they were genuine winners.
-- Every saved GoalOfWeek row is now treated as a winner/archive entry; homepage
-- featuring remains controlled separately by isFeatured.

UPDATE "GoalOfWeek"
SET
  "publishedAt" = COALESCE("publishedAt", "createdAt"),
  "updatedAt" = NOW()
WHERE "publishedAt" IS NULL;
