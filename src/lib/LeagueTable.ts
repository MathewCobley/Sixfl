// src/lib/leagueTable.ts

import { prisma } from "@/lib/prisma";

export type LeagueTableRow = {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export async function getLeagueTable(leagueId: string): Promise<LeagueTableRow[]> {
  const fixtures = await prisma.fixture.findMany({
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
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
        },
      },
      result: {
        select: {
          homeScore: true,
          awayScore: true,
        },
      },
    },
  });

  const table = new Map<string, LeagueTableRow>();

  function getRow(teamId: string, teamName: string): LeagueTableRow {
    let row = table.get(teamId);

    if (!row) {
      row = {
        teamId,
        teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };

      table.set(teamId, row);
    }

    return row;
  }

  for (const fixture of fixtures) {
    if (!fixture.result) continue;

    const home = getRow(fixture.homeTeam.id, fixture.homeTeam.name);
    const away = getRow(fixture.awayTeam.id, fixture.awayTeam.name);

    const homeScore = fixture.result.homeScore;
    const awayScore = fixture.result.awayScore;

    home.played++;
    away.played++;

    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;

    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (awayScore > homeScore) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }

  const rows = Array.from(table.values());

  for (const row of rows) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference)
      return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows;
}