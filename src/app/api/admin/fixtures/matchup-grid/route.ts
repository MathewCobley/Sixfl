// ========================================
// File: src/app/api/admin/fixtures/matchup-grid/route.ts
// ========================================

import { FixtureStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type MatchupCell = {
  opponentId: string;
  opponentName: string;
  homeCount: number;
  awayCount: number;
  totalCount: number;
  latestKickoffAt: string | null;
};

const COUNTABLE_FIXTURE_STATUSES = [
  FixtureStatus.SCHEDULED,
  FixtureStatus.COMPLETED,
] as const;

function getCellLabel(cell: MatchupCell) {
  if (cell.totalCount === 0) return "—";

  const parts: string[] = [];
  if (cell.homeCount > 0) parts.push(`H${cell.homeCount}`);
  if (cell.awayCount > 0) parts.push(`A${cell.awayCount}`);

  return parts.join(" · ");
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const requestedLeagueId = url.searchParams.get("leagueId")?.trim() || null;

  const leagues = await prisma.league.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      season: true,
      isActive: true,
    },
  });

  const league =
    leagues.find((item) => item.id === requestedLeagueId) ?? leagues[0] ?? null;

  if (!league) {
    return NextResponse.json({
      leagues: [],
      selectedLeagueId: null,
      teams: [],
      cells: [],
      summary: {
        scheduledPairs: 0,
        oneWayPairs: 0,
        completedPairs: 0,
        missingPairs: 0,
      },
    });
  }

  const [teams, fixtures] = await Promise.all([
    prisma.team.findMany({
      where: {
        leagueId: league.id,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.fixture.findMany({
      where: {
        leagueId: league.id,
        status: {
          in: [...COUNTABLE_FIXTURE_STATUSES],
        },
      },
      orderBy: [{ kickoffAt: "asc" }],
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        kickoffAt: true,
        status: true,
      },
    }),
  ]);

  const teamIds = new Set(teams.map((team) => team.id));
  const cellMap = new Map<string, MatchupCell>();

  function getCell(teamId: string, opponentId: string) {
    const key = `${teamId}:${opponentId}`;
    const existing = cellMap.get(key);
    if (existing) return existing;

    const opponentName = teams.find((team) => team.id === opponentId)?.name ?? "Unknown team";
    const cell: MatchupCell = {
      opponentId,
      opponentName,
      homeCount: 0,
      awayCount: 0,
      totalCount: 0,
      latestKickoffAt: null,
    };

    cellMap.set(key, cell);
    return cell;
  }

  for (const fixture of fixtures) {
    if (!fixture.homeTeamId || !fixture.awayTeamId) continue;
    if (!teamIds.has(fixture.homeTeamId) || !teamIds.has(fixture.awayTeamId)) continue;

    const homeCell = getCell(fixture.homeTeamId, fixture.awayTeamId);
    homeCell.homeCount += 1;
    homeCell.totalCount += 1;
    homeCell.latestKickoffAt = fixture.kickoffAt.toISOString();

    const awayCell = getCell(fixture.awayTeamId, fixture.homeTeamId);
    awayCell.awayCount += 1;
    awayCell.totalCount += 1;
    awayCell.latestKickoffAt = fixture.kickoffAt.toISOString();
  }

  const cells = teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    opponents: teams.map((opponent) => {
      if (opponent.id === team.id) {
        return {
          opponentId: opponent.id,
          opponentName: opponent.name,
          homeCount: 0,
          awayCount: 0,
          totalCount: 0,
          latestKickoffAt: null,
          label: "—",
          isSelf: true,
        };
      }

      const cell = getCell(team.id, opponent.id);

      return {
        ...cell,
        label: getCellLabel(cell),
        isSelf: false,
      };
    }),
  }));

  let missingPairs = 0;
  let oneWayPairs = 0;
  let completedPairs = 0;
  let scheduledPairs = 0;

  for (let row = 0; row < teams.length; row += 1) {
    for (let col = row + 1; col < teams.length; col += 1) {
      const a = teams[row];
      const b = teams[col];
      const aCell = getCell(a.id, b.id);
      const bCell = getCell(b.id, a.id);
      const total = aCell.totalCount + bCell.totalCount;
      const hasBothDirections =
        aCell.homeCount > 0 && aCell.awayCount > 0 && bCell.homeCount > 0 && bCell.awayCount > 0;

      if (total === 0) missingPairs += 1;
      else if (hasBothDirections) completedPairs += 1;
      else oneWayPairs += 1;
      if (total > 0) scheduledPairs += 1;
    }
  }

  return NextResponse.json({
    leagues: leagues.map((item) => ({
      id: item.id,
      name: item.name,
      season: item.season,
      isActive: item.isActive,
    })),
    selectedLeagueId: league.id,
    selectedLeagueLabel: `${league.name}${league.season ? ` · ${league.season}` : ""}`,
    teams,
    cells,
    summary: {
      scheduledPairs,
      oneWayPairs,
      completedPairs,
      missingPairs,
    },
  });
}
