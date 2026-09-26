-- FixtureSelection is now the only authority for whether a player is in a
-- matchday squad. Preserve the legacy meaning for upcoming fixtures once:
-- where an active PlayerMatchFee previously made a player appear selected and
-- there is no explicit selection decision yet, create that SELECTED decision.
--
-- Never overwrite an existing SELECTED/BACKUP/NOT_SELECTED decision.
INSERT INTO "FixtureSelection" (
  "id",
  "fixtureId",
  "teamMemberId",
  "selectionStatus",
  "isCaptain",
  "isGoalkeeper",
  "note",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-selection-' || fee."id",
  fee."fixtureId",
  fee."teamMemberId",
  'SELECTED',
  FALSE,
  FALSE,
  'Backfilled from the legacy active match-fee selection signal when FixtureSelection became the single source of truth.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PlayerMatchFee" fee
INNER JOIN "Fixture" fixture
  ON fixture."id" = fee."fixtureId"
INNER JOIN "TeamMember" member
  ON member."id" = fee."teamMemberId"
WHERE fee."teamMemberId" IS NOT NULL
  AND fee."status" <> 'CANCELLED'
  AND member."teamId" = fee."teamId"
  AND fixture."kickoffAt" >= CURRENT_TIMESTAMP
  AND fixture."status" IN ('SCHEDULED', 'POSTPONED')
  AND NOT EXISTS (
    SELECT 1
    FROM "FixtureSelection" selection
    WHERE selection."fixtureId" = fee."fixtureId"
      AND selection."teamMemberId" = fee."teamMemberId"
  )
ON CONFLICT ("fixtureId", "teamMemberId") DO NOTHING;
