import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type MatchPerformance = {
  matchResultId: string;
  teamMemberId: string;
  played: boolean;
  rating: number | null;
};

export type PlayerPerformanceHistory = MatchPerformance & {
  kickoffAt: Date;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
};

let tableReady: Promise<void> | null = null;

export function ensurePlayerMatchPerformanceTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PlayerMatchPerformance" (
          "id" TEXT NOT NULL,
          "matchResultId" TEXT NOT NULL,
          "teamId" TEXT NOT NULL,
          "teamMemberId" TEXT NOT NULL,
          "played" BOOLEAN NOT NULL DEFAULT TRUE,
          "rating" DOUBLE PRECISION,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PlayerMatchPerformance_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "PlayerMatchPerformance_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "PlayerMatchPerformance_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "PlayerMatchPerformance_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMatchPerformance_result_team_member_key"
        ON "PlayerMatchPerformance"("matchResultId", "teamId", "teamMemberId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "PlayerMatchPerformance_teamMemberId_idx"
        ON "PlayerMatchPerformance"("teamMemberId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "PlayerMatchPerformance_teamId_matchResultId_idx"
        ON "PlayerMatchPerformance"("teamId", "matchResultId");
      `);
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }

  return tableReady;
}

export async function getMatchPerformances(teamId: string, matchResultIds: string[]) {
  if (matchResultIds.length === 0) return [] as MatchPerformance[];
  await ensurePlayerMatchPerformanceTable();

  return prisma.$queryRaw<MatchPerformance[]>(Prisma.sql`
    SELECT
      "matchResultId",
      "teamMemberId",
      "played",
      "rating"
    FROM "PlayerMatchPerformance"
    WHERE "teamId" = ${teamId}
      AND "matchResultId" IN (${Prisma.join(matchResultIds)})
  `);
}

export async function replaceMatchPerformances(input: {
  teamId: string;
  matchResultId: string;
  rows: Array<{ teamMemberId: string; rating: number | null }>;
}) {
  await ensurePlayerMatchPerformanceTable();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "PlayerMatchPerformance"
      WHERE "teamId" = ${input.teamId}
        AND "matchResultId" = ${input.matchResultId}
    `;

    for (const row of input.rows) {
      await tx.$executeRaw`
        INSERT INTO "PlayerMatchPerformance" (
          "id", "matchResultId", "teamId", "teamMemberId", "played", "rating", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${input.matchResultId}, ${input.teamId}, ${row.teamMemberId}, TRUE, ${row.rating}, NOW()
        )
      `;
    }
  });
}

export async function getPlayerPerformanceHistory(input: {
  teamId: string;
  teamMemberId: string;
  limit?: number;
}) {
  await ensurePlayerMatchPerformanceTable();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

  return prisma.$queryRaw<PlayerPerformanceHistory[]>(Prisma.sql`
    SELECT
      performance."matchResultId",
      performance."teamMemberId",
      performance."played",
      performance."rating",
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
