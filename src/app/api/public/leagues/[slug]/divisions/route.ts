// ========================================
// File: src/app/api/public/leagues/[slug]/divisions/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getLeagueStandings } from "@/lib/standings";

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

    const [standings, upcomingFixtures] = await Promise.all([
      getLeagueStandings(league.id),
      prisma.fixture.findMany({
        where: {
          leagueId: league.id,
          publishedAt: { not: null },
          status: "SCHEDULED",
        },
        orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],
        select: {
          id: true,
          divisionId: true,
          kickoffAt: true,
          homeTeamId: true,
          awayTeamId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      }),
    ]);

    if (!standings.hasDivisions) {
      return NextResponse.json({
        league: { id: league.id, name: league.name },
        divisions: [],
        reason: "single_table",
      });
    }

    const payload = standings.divisions.map((division) => {
      const divisionTeamIds = new Set(division.rows.map((row) => row.teamId));
      const divisionUpcomingFixtures = upcomingFixtures
        .filter((fixture) => {
          if (fixture.divisionId === division.id) return true;
          if (fixture.divisionId) return false;
          return (
            divisionTeamIds.has(fixture.homeTeamId) &&
            divisionTeamIds.has(fixture.awayTeamId)
          );
        })
        .slice(0, 6)
        .map((fixture) => ({
          id: fixture.id,
          kickoffAt: fixture.kickoffAt,
          homeTeam: fixture.homeTeam.name,
          awayTeam: fixture.awayTeam.name,
        }));

      return {
        id: division.id,
        name: division.name,
        slug: division.slug,
        teams: division.rows.map((row) => ({
          id: row.teamId,
          name: row.teamName,
          logoUrl: row.teamLogoUrl,
        })),
        table: division.rows.map((row) => ({
          team: {
            id: row.teamId,
            name: row.teamName,
            logoUrl: row.teamLogoUrl,
          },
          played: row.played,
          wins: row.won,
          draws: row.drawn,
          losses: row.lost,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          points: row.points,
        })),
        upcomingFixtures: divisionUpcomingFixtures,
      };
    });

    return NextResponse.json({
      league: { id: league.id, name: league.name },
      divisions: payload,
    });
  } catch (error) {
    console.error("Could not load public division standings", error);
    return NextResponse.json({ divisions: [] });
  }
}
