import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const issues = await prisma.$queryRawUnsafe(`
    WITH integrity_issues AS (
      SELECT
        'UNRESOLVED_LEGACY_REFERENCE'::text AS "kind",
        issue."matchResultId" AS "matchResultId",
        issue."teamId" AS "teamId",
        NULL::text AS "teamMemberId",
        issue."reason" AS "detail"
      FROM "PlayerPerformanceBackfillIssue" issue
      WHERE issue."resolvedAt" IS NULL

      UNION ALL

      SELECT
        'PLAYED_EVIDENCE_MISMATCH',
        performance."matchResultId",
        performance."teamId",
        performance."teamMemberId",
        'played does not match the stored appearance/contribution evidence'
      FROM "PlayerMatchPerformance" performance
      WHERE performance."played" <>
        (
          performance."appearanceRecorded"
          OR performance."rating" IS NOT NULL
          OR performance."goals" > 0
          OR performance."assists" > 0
          OR performance."isPlayerOfMatch"
        )

      UNION ALL

      SELECT
        'MEMBERSHIP_TEAM_MISMATCH',
        performance."matchResultId",
        performance."teamId",
        performance."teamMemberId",
        'teamMemberId belongs to a different team'
      FROM "PlayerMatchPerformance" performance
      LEFT JOIN "TeamMember" member
        ON member."id" = performance."teamMemberId"
      WHERE member."id" IS NULL OR member."teamId" <> performance."teamId"

      UNION ALL

      SELECT
        'RESULT_TEAM_MISMATCH',
        performance."matchResultId",
        performance."teamId",
        performance."teamMemberId",
        'teamId is not either team in the fixture result'
      FROM "PlayerMatchPerformance" performance
      LEFT JOIN "MatchResult" result
        ON result."id" = performance."matchResultId"
      LEFT JOIN "Fixture" fixture
        ON fixture."id" = result."fixtureId"
      WHERE result."id" IS NULL
        OR performance."teamId" NOT IN (fixture."homeTeamId", fixture."awayTeamId")

      UNION ALL

      SELECT
        'DUPLICATE_PLAYER_MATCH_ROW',
        performance."matchResultId",
        performance."teamId",
        performance."teamMemberId",
        COUNT(*)::text || ' rows exist for the same player and result'
      FROM "PlayerMatchPerformance" performance
      GROUP BY
        performance."matchResultId",
        performance."teamId",
        performance."teamMemberId"
      HAVING COUNT(*) > 1

      UNION ALL

      SELECT
        'MULTIPLE_PLAYER_OF_MATCH',
        performance."matchResultId",
        performance."teamId",
        NULL::text,
        COUNT(*)::text || ' Player of the Match rows exist for one team result'
      FROM "PlayerMatchPerformance" performance
      WHERE performance."isPlayerOfMatch" = TRUE
      GROUP BY performance."matchResultId", performance."teamId"
      HAVING COUNT(*) > 1
    )
    SELECT *
    FROM integrity_issues
    ORDER BY "kind", "teamId", "matchResultId", "teamMemberId"
  `);

  if (issues.length === 0) {
    console.log("Player performance integrity audit passed.");
  } else {
    console.error(`Player performance integrity audit found ${issues.length} issue(s).`);
    console.table(issues);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
