// ========================================
// File: src/app/api/captain/team/[teamid]/dashboard-fixtures/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

type RelatedTeamRow = {
  id: string;
};

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

async function getRelatedTeamIds(input: {
  teamId: string;
  teamName: string;
  currentLeagueId: string | null;
}) {
  const ids = new Set<string>([input.teamId]);

  if (!input.currentLeagueId) {
    return [...ids];
  }

  const relatedRows = await prisma.$queryRaw<RelatedTeamRow[]>(Prisma.sql`
    SELECT DISTINCT t."id"
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" t ON t."id" = lst."teamId"
    WHERE lst."leagueId" = ${input.currentLeagueId}
      AND lst."isActive" = true
      AND LOWER(TRIM(t."name")) = LOWER(TRIM(${input.teamName}))
  `);

  for (const row of relatedRows) {
    ids.add(row.id);
  }

  return [...ids];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          id: true,
          name: true,
          venueName: true,
          competition: {
            select: {
              currentLeague: {
                select: {
                  id: true,
                  venueName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const currentLeagueId = team.league?.competition?.currentLeague?.id ?? team.league?.id ?? null;
  const currentVenueName = team.league?.competition?.currentLeague?.venueName ?? team.league?.venueName ?? null;
  const relatedTeamIds = await getRelatedTeamIds({
    teamId: team.id,
    teamName: team.name,
    currentLeagueId,
  });

  const upcomingFixtures = await prisma.fixture.findMany({
    where: {
      ...(currentLeagueId ? { leagueId: currentLeagueId } : {}),
      OR: [
        { homeTeamId: { in: relatedTeamIds } },
        { awayTeamId: { in: relatedTeamIds } },
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
    teamId: team.id,
    relatedTeamIds,
    currentLeagueId,
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
          fixturesHref: `/captain/team/${team.id}/fixtures`,
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
