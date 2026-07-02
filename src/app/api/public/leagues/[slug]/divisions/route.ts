// ========================================
// File: src/app/api/public/leagues/[slug]/divisions/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DivisionRow = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

type TeamRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  divisionId: string | null;
};

type FixtureRow = {
  id: string;
  divisionId: string | null;
  status: string;
  kickoffAt: Date;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamLogoUrl: string | null;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamLogoUrl: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

type TableRow = {
  team: { id: string; name: string; logoUrl: string | null };
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

function buildTable(teams: TeamRow[], fixtures: FixtureRow[]): TableRow[] {
  const rows = new Map<string, TableRow>();

  for (const team of teams) {
    rows.set(team.id, {
      team: { id: team.id, name: team.name, logoUrl: team.logoUrl },
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  for (const fixture of fixtures) {
    if (fixture.status !== "COMPLETED" || fixture.homeScore === null || fixture.awayScore === null) continue;

    const home = rows.get(fixture.homeTeamId);
    const away = rows.get(fixture.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += fixture.homeScore;
    home.goalsAgainst += fixture.awayScore;
    away.goalsFor += fixture.awayScore;
    away.goalsAgainst += fixture.homeScore;

    if (fixture.homeScore > fixture.awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (fixture.awayScore > fixture.homeScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return Array.from(rows.values())
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.name.localeCompare(b.team.name);
    });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const league = await prisma.league.findFirst({
      where: { slug, isActive: true },
      select: { id: true, name: true },
    });

    if (!league) {
      return NextResponse.json({ divisions: [] }, { status: 404 });
    }

    const [divisions, teams, fixtures] = await Promise.all([
      prisma.$queryRaw<DivisionRow[]>(Prisma.sql`
        SELECT "id", "name", "slug", "sortOrder"
        FROM "LeagueDivision"
        WHERE "leagueId" = ${league.id}
          AND "isActive" = true
        ORDER BY "sortOrder" ASC, "name" ASC
      `),
      prisma.$queryRaw<TeamRow[]>(Prisma.sql`
        SELECT "id", "name", "logoUrl", "divisionId"
        FROM "Team"
        WHERE "leagueId" = ${league.id}
        ORDER BY "name" ASC
      `),
      prisma.$queryRaw<FixtureRow[]>(Prisma.sql`
        SELECT
          f."id",
          f."divisionId",
          f."status",
          f."kickoffAt",
          ht."id" AS "homeTeamId",
          ht."name" AS "homeTeamName",
          ht."logoUrl" AS "homeTeamLogoUrl",
          awt."id" AS "awayTeamId",
          awt."name" AS "awayTeamName",
          awt."logoUrl" AS "awayTeamLogoUrl",
          mr."homeScore",
          mr."awayScore"
        FROM "Fixture" f
        JOIN "Team" ht ON ht."id" = f."homeTeamId"
        JOIN "Team" awt ON awt."id" = f."awayTeamId"
        LEFT JOIN "MatchResult" mr ON mr."fixtureId" = f."id"
        WHERE f."leagueId" = ${league.id}
          AND f."publishedAt" IS NOT NULL
        ORDER BY f."kickoffAt" ASC, f."position" ASC
      `),
    ]);

    const payload = divisions.map((division) => {
      const divisionTeams = teams.filter((team) => team.divisionId === division.id);
      const divisionTeamIds = new Set(divisionTeams.map((team) => team.id));
      const divisionFixtures = fixtures.filter((fixture) => {
        if (fixture.divisionId === division.id) return true;
        if (fixture.divisionId) return false;
        return divisionTeamIds.has(fixture.homeTeamId) && divisionTeamIds.has(fixture.awayTeamId);
      });
      const upcomingFixtures = divisionFixtures
        .filter((fixture) => fixture.status === "SCHEDULED")
        .slice(0, 6)
        .map((fixture) => ({
          id: fixture.id,
          kickoffAt: fixture.kickoffAt,
          homeTeam: fixture.homeTeamName,
          awayTeam: fixture.awayTeamName,
        }));

      return {
        id: division.id,
        name: division.name,
        slug: division.slug,
        teams: divisionTeams.map((team) => ({
          id: team.id,
          name: team.name,
          logoUrl: team.logoUrl,
        })),
        table: buildTable(divisionTeams, divisionFixtures),
        upcomingFixtures,
      };
    });

    return NextResponse.json({ league: { id: league.id, name: league.name }, divisions: payload });
  } catch {
    return NextResponse.json({ divisions: [] });
  }
}
