// ========================================
// File: src/lib/current-leagues.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type CurrentLeagueOption = {
  id: string;
  name: string;
  season: string | null;
  isActive: boolean;
};

export async function getCurrentLeagueOptions(includeLeagueId?: string | null) {
  const includeId = includeLeagueId?.trim() || null;

  try {
    return prisma.$queryRaw<CurrentLeagueOption[]>(Prisma.sql`
      SELECT
        l."id",
        l."name",
        l."season",
        l."isActive"
      FROM "League" l
      LEFT JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
      WHERE (
        l."isActive" = true
        AND (
          l."competitionId" IS NULL
          OR c."currentLeagueId" = l."id"
        )
      )
      OR (${includeId}::text IS NOT NULL AND l."id" = ${includeId})
      ORDER BY l."isActive" DESC, l."name" ASC, l."season" ASC
    `);
  } catch {
    return prisma.league.findMany({
      where: { isActive: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
      select: {
        id: true,
        name: true,
        season: true,
        isActive: true,
      },
    });
  }
}
