import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MatchReportWarning = { fixtureId: string; resultId: string; teamId: string; teamName: string; homeName: string; awayName: string; kickoffAt: Date; goalsRecorded: number; ownGoals: number; assistsRecorded: number; goalsExpected: number };

/** Always compare with the played score, including after official score corrections.
 * Derived warnings clear automatically once either the report or score is corrected. */
export async function getMatchReportWarnings(fixtureId?: string, fixtureIds?: string[]) {
  if (fixtureIds?.length === 0) return [];
  return prisma.$queryRaw<MatchReportWarning[]>(Prisma.sql`
    SELECT f."id" AS "fixtureId", r."id" AS "resultId", m."teamId", t."name" AS "teamName",
      h."name" AS "homeName", a."name" AS "awayName", f."kickoffAt",
      m."goalsRecorded", m."ownGoals", totals.assists AS "assistsRecorded", scores.expected AS "goalsExpected"
    FROM "MatchResultTeamMeta" m
    JOIN "MatchResult" r ON r."id" = m."matchResultId"
    JOIN "Fixture" f ON f."id" = r."fixtureId"
    JOIN "Team" t ON t."id" = m."teamId"
    JOIN "Team" h ON h."id" = f."homeTeamId"
    JOIN "Team" a ON a."id" = f."awayTeamId"
    LEFT JOIN "MatchResultOverturn" o ON o."matchResultId" = r."id"
    CROSS JOIN LATERAL (SELECT CASE WHEN m."teamId" = f."homeTeamId"
      THEN COALESCE(o."originalHomeScore", r."homeScore") ELSE COALESCE(o."originalAwayScore", r."awayScore") END AS expected) scores
    CROSS JOIN LATERAL (SELECT COALESCE(SUM(CASE WHEN value->>'assists' ~ '^[0-9]{1,6}$' THEN (value->>'assists')::int ELSE 0 END), 0)::int AS assists
      FROM JSONB_ARRAY_ELEMENTS(CASE WHEN JSONB_TYPEOF(m."scorers") = 'array' THEN m."scorers" ELSE '[]'::jsonb END)) totals
    WHERE (m."goalsRecorded" + m."ownGoals" > scores.expected OR totals.assists > scores.expected)
      AND m."teamId" IN (f."homeTeamId", f."awayTeamId")
      ${fixtureIds ? Prisma.sql`AND f."id" IN (${Prisma.join(fixtureIds)})` : Prisma.empty}
      ${fixtureId ? Prisma.sql`AND f."id" = ${fixtureId}` : Prisma.empty}
    ORDER BY f."kickoffAt" DESC, t."name"
  `);
}
