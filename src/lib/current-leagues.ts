// ========================================
// File: src/lib/current-leagues.ts
// ========================================

import { PreferredNight, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type CurrentLeagueOption = {
  id: string;
  name: string;
  season: string | null;
  isActive: boolean;
  area: string | null;
  dayOfWeek: PreferredNight | null;
  venueName: string | null;
};

export async function getCurrentLeagueOptions(includeLeagueId?: string | null) {
  const includeId = includeLeagueId?.trim() || null;

  try {
    return prisma.$queryRaw<CurrentLeagueOption[]>(Prisma.sql`
      SELECT
        l."id",
        l."name",
        l."season",
        l."isActive",
        l."area",
        l."dayOfWeek",
        l."venueName"
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
      where: includeId
        ? {
            OR: [{ isActive: true }, { id: includeId }],
          }
        : { isActive: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
      select: {
        id: true,
        name: true,
        season: true,
        isActive: true,
        area: true,
        dayOfWeek: true,
        venueName: true,
      },
    });
  }
}

export async function getCurrentLeagueIds(includeLeagueId?: string | null) {
  const includeId = includeLeagueId?.trim() || null;

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT l."id"
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
      ORDER BY l."name" ASC, l."season" ASC
    `);

    return rows.map((row) => row.id);
  } catch {
    const rows = await prisma.league.findMany({
      where: includeId
        ? {
            OR: [{ isActive: true }, { id: includeId }],
          }
        : { isActive: true },
      orderBy: [{ name: "asc" }, { season: "asc" }],
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }
}
