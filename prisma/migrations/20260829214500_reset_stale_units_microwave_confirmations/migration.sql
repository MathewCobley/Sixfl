-- This fixture was moved to 21:15 on 29 August before the Night Board
-- fixture-change workflow was deployed. Its earlier team responses must not
-- continue to count against the amended kick-off.
UPDATE "FixtureCaptainConfirmation" AS confirmation
SET
  "status" = 'PENDING',
  "confirmedAt" = NULL,
  "issueRaisedAt" = NULL,
  "lastChasedAt" = NULL,
  "confirmedByUserId" = NULL,
  "note" = 'Fixture time changed on the Night Board. Team needs to confirm the updated 21:15 kick-off.',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Fixture" AS fixture
JOIN "Team" AS home_team ON home_team."id" = fixture."homeTeamId"
JOIN "Team" AS away_team ON away_team."id" = fixture."awayTeamId"
JOIN "League" AS league ON league."id" = fixture."leagueId"
WHERE confirmation."fixtureId" = fixture."id"
  AND fixture."publishedAt" IS NOT NULL
  AND fixture."status" = 'SCHEDULED'
  AND fixture."kickoffAt" >= TIMESTAMP '2026-09-02 00:00:00'
  AND fixture."kickoffAt" < TIMESTAMP '2026-09-03 00:00:00'
  AND LOWER(league."name") = 'northallerton wednesday mens'
  AND (
    (
      LOWER(home_team."name") = 'the units'
      AND LOWER(away_team."name") = 'microwave afc'
    )
    OR (
      LOWER(home_team."name") = 'microwave afc'
      AND LOWER(away_team."name") = 'the units'
    )
  )
  AND confirmation."status" IN ('CONFIRMED', 'ISSUE_RAISED');
