import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type PlayerPerformanceSource =
  | "CAPTAIN_RECORDED"
  | "SQUAD_SELECTION"
  | "MATCH_CONTRIBUTION"
  | "PLAYER_OF_MATCH"
  | "ADMIN_CORRECTED"
  | "LEGACY_UNKNOWN";

export type MatchPerformance = {
  matchResultId: string;
  teamMemberId: string;
  played: boolean;
  appearanceRecorded: boolean;
  rating: number | null;
  goals: number;
  assists: number;
  isPlayerOfMatch: boolean;
  source: PlayerPerformanceSource;
};

export type PlayerPerformanceHistory = MatchPerformance & {
  kickoffAt: Date;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
};

export type PlayerPerformanceSummary = {
  teamMemberId: string;
  appearances: number;
  ratedAppearances: number;
  averageRating: number | null;
  goals: number;
  assists: number;
  playerOfMatchAwards: number;
};

/**
 * Kept temporarily for callers introduced before the table became a real
 * migration. Table creation now belongs exclusively to Prisma migrations.
 */
export async function ensurePlayerMatchPerformanceTable() {
  return;
}

export async function getMatchPerformances(
  teamId: string,
  matchResultIds: string[],
) {
  if (matchResultIds.length === 0) return [] as MatchPerformance[];

  return prisma.$queryRaw<MatchPerformance[]>(Prisma.sql`
    SELECT
      "matchResultId",
      "teamMemberId",
      "played",
      "appearanceRecorded",
      "rating",
      "goals",
      "assists",
      "isPlayerOfMatch",
      "source"
    FROM "PlayerMatchPerformance"
    WHERE "teamId" = ${teamId}
      AND "matchResultId" IN (${Prisma.join(matchResultIds)})
      AND "played" = TRUE
  `);
}

export async function getTeamPlayerPerformanceSummaries(teamId: string) {
  return prisma.$queryRaw<PlayerPerformanceSummary[]>(Prisma.sql`
    SELECT
      "teamMemberId",
      COUNT(*)::int AS "appearances",
      COUNT("rating")::int AS "ratedAppearances",
      AVG("rating")::double precision AS "averageRating",
      COALESCE(SUM("goals"), 0)::int AS "goals",
      COALESCE(SUM("assists"), 0)::int AS "assists",
      COUNT(*) FILTER (WHERE "isPlayerOfMatch" = TRUE)::int AS "playerOfMatchAwards"
    FROM "PlayerMatchPerformance"
    WHERE "teamId" = ${teamId}
      AND "played" = TRUE
    GROUP BY "teamMemberId"
  `);
}

/**
 * Replaces only the captain-recorded appearance/rating evidence for a match.
 * Goals, assists and Player of the Match are maintained by the database trigger
 * from MatchResultTeamMeta, so concurrent saves cannot erase either side.
 */
export async function replaceMatchPerformances(input: {
  teamId: string;
  matchResultId: string;
  rows: Array<{ teamMemberId: string; rating: number | null }>;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "PlayerMatchPerformance"
      SET
        "appearanceRecorded" = FALSE,
        "rating" = NULL,
        "updatedAt" = NOW()
      WHERE "teamId" = ${input.teamId}
        AND "matchResultId" = ${input.matchResultId}
    `;

    for (const row of input.rows) {
      await tx.$executeRaw`
        INSERT INTO "PlayerMatchPerformance" (
          "id",
          "matchResultId",
          "teamId",
          "teamMemberId",
          "played",
          "appearanceRecorded",
          "rating",
          "goals",
          "assists",
          "isPlayerOfMatch",
          "source",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${randomUUID()},
          ${input.matchResultId},
          ${input.teamId},
          ${row.teamMemberId},
          TRUE,
          TRUE,
          ${row.rating},
          0,
          0,
          FALSE,
          'CAPTAIN_RECORDED',
          NOW(),
          NOW()
        )
        ON CONFLICT ("matchResultId", "teamId", "teamMemberId") DO UPDATE SET
          "appearanceRecorded" = TRUE,
          "rating" = EXCLUDED."rating",
          "source" = 'CAPTAIN_RECORDED',
          "updatedAt" = NOW()
      `;
    }

    await tx.$executeRaw`
      DELETE FROM "PlayerMatchPerformance"
      WHERE "teamId" = ${input.teamId}
        AND "matchResultId" = ${input.matchResultId}
        AND "played" = FALSE
    `;
  });
}

export async function getPlayerPerformanceHistory(input: {
  teamId: string;
  teamMemberId: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

  return prisma.$queryRaw<PlayerPerformanceHistory[]>(Prisma.sql`
    SELECT
      performance."matchResultId",
      performance."teamMemberId",
      performance."played",
      performance."appearanceRecorded",
      performance."rating",
      performance."goals",
      performance."assists",
      performance."isPlayerOfMatch",
      performance."source",
      fixture."kickoffAt",
      fixture."homeTeamId",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName",
      result."homeScore",
      result."awayScore"
    FROM "PlayerMatchPerformance" performance
    INNER JOIN "MatchResult" result ON result."id" = performance."matchResultId"
    INNER JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE performance."teamId" = ${input.teamId}
      AND performance."teamMemberId" = ${input.teamMemberId}
      AND performance."played" = TRUE
    ORDER BY fixture."kickoffAt" DESC
    LIMIT ${limit}
  `);
}
