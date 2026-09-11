import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export type TeamMatchReportActivity = {
  reportCount: number;
  latestMatchAt: string;
};

type ActivityRow = {
  teamId: string;
  reportCount: number;
  latestMatchAt: Date;
};

/** Read-only use of the team's match-details form, not AI article generation.
 * Count distinct completed matches, not players or repeated saves. Records are
 * scoped to exact team IDs: a similarly named club cannot earn another's badge.
 * Historical metadata has no author field, so this is evidence of saved details,
 * not a claim that a particular captain personally submitted them.
 */
export async function getAdminTeamMatchReportActivity(teamIds: readonly string[]) {
  await requireAdmin();
  const ids = [...new Set(teamIds.filter((id) => id.trim()))];
  // Absent = no qualifying report; null = unavailable (never imply no use).
  const activity = new Map<string, TeamMatchReportActivity | null>();
  if (!ids.length) return activity;

  try {
    const rows = await prisma.$queryRaw<ActivityRow[]>(Prisma.sql`
      WITH reported_matches AS (
        SELECT meta."teamId", meta."matchResultId"
        FROM "MatchResultTeamMeta" meta
        WHERE meta."teamId" IN (${Prisma.join(ids)})
          AND (
            BTRIM(COALESCE(meta."playerOfMatchName", '')) <> ''
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(meta."scorers") = 'array'
                  THEN meta."scorers" ELSE '[]'::jsonb END
              ) contribution
              WHERE BTRIM(COALESCE(contribution->>'name', '')) <> ''
                AND (
                  COALESCE(contribution->>'goals', '') ~ '^0*[1-9][0-9]*$'
                  OR COALESCE(contribution->>'assists', '') ~ '^0*[1-9][0-9]*$'
                )
            )
          )
        UNION
        SELECT performance."teamId", performance."matchResultId"
        FROM "PlayerMatchPerformance" performance
        WHERE performance."teamId" IN (${Prisma.join(ids)})
          AND performance."source" = 'CAPTAIN_RECORDED'
          AND performance."rating" BETWEEN 1 AND 10
      )
      SELECT reported."teamId", COUNT(*)::int AS "reportCount",
        MAX(fixture."kickoffAt") AS "latestMatchAt"
      FROM reported_matches reported
      JOIN "MatchResult" result ON result."id" = reported."matchResultId"
      JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
      WHERE fixture."status" = 'COMPLETED'
        AND fixture."kickoffAt" <= CURRENT_TIMESTAMP
        AND reported."teamId" IN (fixture."homeTeamId", fixture."awayTeamId")
      GROUP BY reported."teamId"
    `);
    for (const row of rows) {
      activity.set(row.teamId, {
        reportCount: row.reportCount,
        latestMatchAt: row.latestMatchAt.toISOString(),
      });
    }
  } catch (error) {
    // An optional indicator must not break team administration or mislabel teams.
    console.warn("[admin-team-match-reports] Activity unavailable", {
      name: error instanceof Error ? error.name : "unknown",
    });
    for (const id of ids) activity.set(id, null);
  }
  return activity;
}
