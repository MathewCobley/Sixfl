// ========================================
// File: src/app/api/admin/night-board/missing-team-fixtures/route.ts
// ========================================

import { FixtureStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamWeekUnavailabilityOverview } from "@/lib/team-week-unavailability-overview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VISIBLE_FIXTURE_STATUSES: FixtureStatus[] = [
  FixtureStatus.SCHEDULED,
  FixtureStatus.COMPLETED,
];

function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toLondonDateInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function dayRangeFromInput(dateInput: string) {
  const start = new Date(`${dateInput}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function weekRangeFromInput(dateInput: string) {
  const selectedDate = new Date(`${dateInput}T00:00:00.000Z`);
  const mondayOffset = (selectedDate.getUTCDay() + 6) % 7;
  const start = new Date(selectedDate);
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function formatWeekBeginning(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(value);
}

async function findNextFixtureDate(input: {
  leagueId: string;
  venueId: string;
}) {
  const baseWhere = {
    publishedAt: { not: null },
    kickoffAt: { gte: new Date() },
    status: { in: VISIBLE_FIXTURE_STATUSES },
    ...(input.leagueId ? { leagueId: input.leagueId } : {}),
  };

  let nextFixture = await prisma.fixture.findFirst({
    where: {
      ...baseWhere,
      ...(input.venueId ? { venueId: input.venueId } : {}),
    },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true },
  });

  if (!nextFixture && input.venueId) {
    nextFixture = await prisma.fixture.findFirst({
      where: baseWhere,
      orderBy: { kickoffAt: "asc" },
      select: { kickoffAt: true },
    });
  }

  return nextFixture?.kickoffAt ?? null;
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date")?.trim() ?? "";
  const leagueId = url.searchParams.get("leagueId")?.trim() ?? "";
  const venueId = url.searchParams.get("venueId")?.trim() ?? "";

  let selectedDate = isDateInput(requestedDate) ? requestedDate : "";
  if (!selectedDate) {
    const nextKickoffAt = await findNextFixtureDate({ leagueId, venueId });
    selectedDate = toLondonDateInput(nextKickoffAt ?? new Date());
  }

  const dayRange = dayRangeFromInput(selectedDate);
  const dayFixtureWhere = {
    publishedAt: { not: null },
    kickoffAt: { gte: dayRange.start, lt: dayRange.end },
    status: { in: VISIBLE_FIXTURE_STATUSES },
    ...(leagueId ? { leagueId } : {}),
  };

  let boardFixtures = await prisma.fixture.findMany({
    where: {
      ...dayFixtureWhere,
      ...(venueId ? { venueId } : {}),
    },
    select: { leagueId: true },
  });

  if (boardFixtures.length === 0 && venueId) {
    boardFixtures = await prisma.fixture.findMany({
      where: dayFixtureWhere,
      select: { leagueId: true },
    });
  }

  const relevantLeagueIds = leagueId
    ? [leagueId]
    : Array.from(new Set(boardFixtures.map((fixture) => fixture.leagueId)));

  if (relevantLeagueIds.length === 0) {
    return NextResponse.json(
      { selectedDate, warnings: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const weekRange = weekRangeFromInput(selectedDate);
  const [leagues, weeklyFixtures, advanceNotices] = await Promise.all([
    prisma.league.findMany({
      where: { id: { in: relevantLeagueIds } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        teams: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            division: { select: { name: true } },
          },
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        leagueId: { in: relevantLeagueIds },
        publishedAt: { not: null },
        kickoffAt: { gte: weekRange.start, lt: weekRange.end },
        status: { in: VISIBLE_FIXTURE_STATUSES },
      },
      select: {
        leagueId: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    }),
    getTeamWeekUnavailabilityOverview({
      from: weekRange.start,
      to: weekRange.end,
      leagueIds: relevantLeagueIds,
    }),
  ]);

  const scheduledTeamIdsByLeague = new Map<string, Set<string>>();
  for (const fixture of weeklyFixtures) {
    const teamIds = scheduledTeamIdsByLeague.get(fixture.leagueId) ?? new Set<string>();
    teamIds.add(fixture.homeTeamId);
    teamIds.add(fixture.awayTeamId);
    scheduledTeamIdsByLeague.set(fixture.leagueId, teamIds);
  }

  const noticeByTeamId = new Map(
    advanceNotices.map((notice) => [notice.teamId, notice]),
  );
  const weekBeginning = formatWeekBeginning(weekRange.start);

  const advanceWarnings = advanceNotices.map((notice) => {
    if (notice.status === "PUBLISHED_CONFLICT") {
      return {
        key: `advance-unavailability-published-conflict:${notice.id}`,
        level: "red" as const,
        leagueId: notice.leagueId,
        teamId: notice.teamId,
        teamName: notice.teamName,
        message: `Advance unavailability conflict: ${notice.teamName} told SIXFL they cannot field a team for the week beginning ${weekBeginning}, but they have a published fixture. Contact the team and review the fixture.`,
      };
    }

    if (notice.status === "DRAFT_CONFLICT") {
      return {
        key: `advance-unavailability-draft-conflict:${notice.id}`,
        level: "amber" as const,
        leagueId: notice.leagueId,
        teamId: notice.teamId,
        teamName: notice.teamName,
        message: `Draft fixture conflict: ${notice.teamName} reported that they cannot field a team for the week beginning ${weekBeginning}, but a draft fixture still includes them. Fix it before publishing.`,
      };
    }

    return {
      key: `advance-unavailability-recorded:${notice.id}`,
      level: "info" as const,
      leagueId: notice.leagueId,
      teamId: notice.teamId,
      teamName: notice.teamName,
      message: `Advance notice recorded: ${notice.teamName} cannot field a team for the week beginning ${weekBeginning}. No fixture is expected for them this week.`,
    };
  });

  const missingFixtureWarnings = leagues.flatMap((league) => {
    const scheduledTeamIds = scheduledTeamIdsByLeague.get(league.id) ?? new Set<string>();

    return league.teams
      .filter(
        (team) =>
          !scheduledTeamIds.has(team.id) && !noticeByTeamId.has(team.id),
      )
      .map((team) => {
        const leagueLabel = team.division?.name
          ? `${league.name} · ${team.division.name}`
          : league.name;

        return {
          key: `missing-weekly-fixture:${league.id}:${team.id}`,
          level: "amber" as const,
          leagueId: league.id,
          teamId: team.id,
          teamName: team.name,
          message: `Potential issue – no fixture this week: ${team.name} has no published scheduled or completed fixture in ${leagueLabel} for the week beginning ${weekBeginning}. This may be intentional, for example a bye, but it is worth checking.`,
        };
      });
  });

  return NextResponse.json(
    { selectedDate, warnings: [...advanceWarnings, ...missingFixtureWarnings] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
