// ========================================
// File: src/lib/standings.ts
// Authoritative league standings service.
// ========================================

import { Prisma } from "@prisma/client";

import { getLeagueTable, type LeagueTableRow } from "@/lib/leagueTable";
import { prisma } from "@/lib/prisma";

export type StandingDivision = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  rows: LeagueTableRow[];
};

export type StandingsMembershipConflict = {
  teamId: string;
  teamName: string;
  divisionId: string | null;
  divisionName: string | null;
  teamLeagueId: string | null;
};

export type LeagueStandings = {
  league: {
    id: string;
    name: string;
    season: string | null;
    slug: string;
  };
  divisions: StandingDivision[];
  rows: LeagueTableRow[];
  hasDivisions: boolean;
  membershipConflicts: StandingsMembershipConflict[];
};

export type TeamStanding = {
  teamId: string;
  divisionId: string | null;
  divisionName: string | null;
  position: number | null;
  totalTeams: number;
  row: LeagueTableRow | null;
};

type DivisionRow = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

type MembershipConflictRow = {
  teamId: string;
  teamName: string;
  divisionId: string | null;
  divisionName: string | null;
  teamLeagueId: string | null;
};

/**
 * The only supported entry point for league standings throughout SIXFL.
 *
 * Pages, APIs, PDFs and graphics must consume this service rather than query
 * LeagueSeasonTeam, LeagueDivision, Fixture or MatchResult independently.
 */
export async function getLeagueStandings(leagueId: string): Promise<LeagueStandings> {
  const [league, divisionRows, membershipConflicts] = await Promise.all([
    prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true, season: true, slug: true },
    }),
    prisma.$queryRaw<DivisionRow[]>(Prisma.sql`
      SELECT "id", "name", "slug", "sortOrder"
      FROM "LeagueDivision"
      WHERE "leagueId" = ${leagueId}
        AND "isActive" = true
      ORDER BY "sortOrder" ASC, "name" ASC
    `),
    prisma.$queryRaw<MembershipConflictRow[]>(Prisma.sql`
      SELECT
        t."id" AS "teamId",
        t."name" AS "teamName",
        lst."divisionId" AS "divisionId",
        d."name" AS "divisionName",
        t."leagueId" AS "teamLeagueId"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      LEFT JOIN "LeagueDivision" d ON d."id" = lst."divisionId"
      WHERE lst."leagueId" = ${leagueId}
        AND lst."isActive" = true
        AND (t."leagueId" IS NULL OR t."leagueId" <> ${leagueId})
      ORDER BY t."name" ASC
    `),
  ]);

  if (!league) {
    throw new Error("League not found.");
  }

  if (divisionRows.length > 0) {
    const divisions = await Promise.all(
      divisionRows.map(async (division) => ({
        ...division,
        rows: await getLeagueTable(leagueId, { divisionId: division.id }),
      })),
    );

    return {
      league,
      divisions,
      rows: divisions.flatMap((division) => division.rows),
      hasDivisions: true,
      membershipConflicts,
    };
  }

  const rows = await getLeagueTable(leagueId);
  return {
    league,
    divisions: [],
    rows,
    hasDivisions: false,
    membershipConflicts,
  };
}

export async function getTeamStanding(input: {
  leagueId: string;
  teamIds: string[];
}): Promise<TeamStanding> {
  const standings = await getLeagueStandings(input.leagueId);
  const teamIds = new Set(input.teamIds);

  if (standings.hasDivisions) {
    for (const division of standings.divisions) {
      const positionIndex = division.rows.findIndex((row) => teamIds.has(row.teamId));
      if (positionIndex >= 0) {
        return {
          teamId: division.rows[positionIndex].teamId,
          divisionId: division.id,
          divisionName: division.name,
          position: positionIndex + 1,
          totalTeams: division.rows.length,
          row: division.rows[positionIndex],
        };
      }
    }
  } else {
    const positionIndex = standings.rows.findIndex((row) => teamIds.has(row.teamId));
    if (positionIndex >= 0) {
      return {
        teamId: standings.rows[positionIndex].teamId,
        divisionId: null,
        divisionName: null,
        position: positionIndex + 1,
        totalTeams: standings.rows.length,
        row: standings.rows[positionIndex],
      };
    }
  }

  return {
    teamId: input.teamIds[0] ?? "",
    divisionId: null,
    divisionName: null,
    position: null,
    totalTeams: 0,
    row: null,
  };
}
