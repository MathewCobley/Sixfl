// ========================================
// File: src/lib/captain/related-teams.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type RelatedTeamRow = {
  id: string;
};

export async function getCaptainRelatedTeamContext(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      divisionId: true,
      leagueId: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          slug: true,
          venueName: true,
          dayOfWeek: true,
          isActive: true,
          competitionId: true,
          competition: {
            select: {
              id: true,
              name: true,
              currentLeague: {
                select: {
                  id: true,
                  name: true,
                  season: true,
                  slug: true,
                  venueName: true,
                  dayOfWeek: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!team) {
    return null;
  }

  const currentLeague = team.league?.competition?.currentLeague ?? team.league ?? null;
  const currentLeagueId = currentLeague?.id ?? null;
  const relatedTeamIds = new Set<string>([team.id]);

  const sameNameRows = await prisma.$queryRaw<RelatedTeamRow[]>(Prisma.sql`
    SELECT DISTINCT t."id"
    FROM "Team" t
    WHERE LOWER(TRIM(t."name")) = LOWER(TRIM(${team.name}))
  `);

  for (const row of sameNameRows) {
    relatedTeamIds.add(row.id);
  }

  if (currentLeagueId) {
    const currentSeasonRows = await prisma.$queryRaw<RelatedTeamRow[]>(Prisma.sql`
      SELECT DISTINCT t."id"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      WHERE lst."leagueId" = ${currentLeagueId}
        AND lst."isActive" = true
        AND LOWER(TRIM(t."name")) = LOWER(TRIM(${team.name}))
    `);

    for (const row of currentSeasonRows) {
      relatedTeamIds.add(row.id);
    }
  }

  return {
    team,
    competitionName: team.league?.competition?.name ?? null,
    currentLeague,
    currentLeagueId,
    relatedTeamIds: [...relatedTeamIds],
  };
}
