// ========================================
// File: src/app/api/captain/team/[teamid]/dashboard-fixtures/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function formatKickoff(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFixtureLabel(input: {
  homeTeamName: string;
  awayTeamName: string;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const context = await getCaptainRelatedTeamContext(teamid);

  if (!context) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const currentVenueName = context.currentLeague?.venueName ?? context.team.league?.venueName ?? null;

  const upcomingFixtures = await prisma.fixture.findMany({
    where: {
      ...(context.currentLeagueId ? { leagueId: context.currentLeagueId } : {}),
      OR: [
        { homeTeamId: { in: context.relatedTeamIds } },
        { awayTeamId: { in: context.relatedTeamIds } },
      ],
      publishedAt: { not: null },
      kickoffAt: { gte: new Date() },
      result: null,
      status: "SCHEDULED",
    },
    orderBy: [{ kickoffAt: "asc" }],
    take: 5,
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true } },
    },
  });

  const nextFixture = upcomingFixtures[0] ?? null;

  return NextResponse.json({
    teamId: context.team.id,
    relatedTeamIds: context.relatedTeamIds,
    currentLeagueId: context.currentLeagueId,
    count: upcomingFixtures.length,
    nextFixture: nextFixture
      ? {
          id: nextFixture.id,
          label: getFixtureLabel({
            homeTeamName: nextFixture.homeTeam.name,
            awayTeamName: nextFixture.awayTeam.name,
          }),
          kickoffLabel: formatKickoff(nextFixture.kickoffAt),
          venueName: nextFixture.venue?.name ?? currentVenueName ?? "Venue TBC",
          fixturesHref: `/captain/team/${context.team.id}/fixtures`,
        }
      : null,
    fixtures: upcomingFixtures.map((fixture) => ({
      id: fixture.id,
      label: getFixtureLabel({
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
      }),
      kickoffLabel: formatKickoff(fixture.kickoffAt),
      venueName: fixture.venue?.name ?? currentVenueName ?? "Venue TBC",
    })),
  });
}
