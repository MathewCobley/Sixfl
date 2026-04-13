// ========================================
// File: src/lib/leagueTable.ts
// ========================================

import { prisma } from "@/lib/prisma";

export type LeagueTableRow = {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

function createRow(input: {
  id: string;
  name: string;
  logoUrl: string | null;
}): LeagueTableRow {
  return {
    teamId: input.id,
    teamName: input.name,
    teamLogoUrl: input.logoUrl,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

function getOrCreateRow(
  table: Map<string, LeagueTableRow>,
  input: {
    id: string;
    name: string;
    logoUrl: string | null;
  },
): LeagueTableRow {
  const existing = table.get(input.id);

  if (existing) {
    existing.teamName = input.name;
    if (!existing.teamLogoUrl && input.logoUrl) {
      existing.teamLogoUrl = input.logoUrl;
    }
    return existing;
  }

  const created = createRow(input);
  table.set(input.id, created);
  return created;
}

export async function getLeagueTable(leagueId: string): Promise<LeagueTableRow[]> {
  const [teams, fixtures] = await Promise.all([
    prisma.team.findMany({
      where: {
        leagueId,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
    }),
    prisma.fixture.findMany({
      where: {
        leagueId,
        status: "COMPLETED",
        result: {
          isNot: null,
        },
      },
      include: {
        homeTeam: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        result: {
          select: {
            homeScore: true,
            awayScore: true,
          },
        },
      },
    }),
  ]);

  const table = new Map<string, LeagueTableRow>();

  for (const team of teams) {
    table.set(team.id, createRow(team));
  }

  for (const fixture of fixtures) {
    if (!fixture.result) continue;

    const home = getOrCreateRow(table, fixture.homeTeam);
    const away = getOrCreateRow(table, fixture.awayTeam);

    const homeScore = fixture.result.homeScore;
    const awayScore = fixture.result.awayScore;

    home.played += 1;
    away.played += 1;

    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;

    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (awayScore > homeScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const rows = Array.from(table.values()).map((row) => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) {
      return b.goalDifference - a.goalDifference;
    }
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows;
}