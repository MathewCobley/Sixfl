// ========================================
// File: src/app/api/captain/team/[teamid]/fixture-badges/route.ts
// ========================================

import { NextResponse } from "next/server";

import {
  getStoredAiPreviewsByFixtureIds,
  refreshStoredAiPreviewForFixture,
} from "@/lib/fixtures/storedAiPredictions";
import { calculateFixtureWinChance } from "@/lib/fixtures/winChance";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamBadge = {
  id: string;
  name: string;
  logoUrl: string | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Could not load fixture badges.";
}

function normaliseLogoUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function toTeamBadge(team: TeamBadge) {
  return {
    id: team.id,
    name: team.name,
    logoUrl: normaliseLogoUrl(team.logoUrl),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const teamId = teamid;

  try {
    await requireCaptain(teamId);

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { leagueId: true },
    });

    const [fixtures, leagueFixtures] = await Promise.all([
      prisma.fixture.findMany({
        where: {
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
        orderBy: [{ kickoffAt: "desc" }],
        take: 100,
        select: {
          id: true,
          kickoffAt: true,
          status: true,
          homeTeamId: true,
          awayTeamId: true,
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
        },
      }),
      team?.leagueId
        ? prisma.fixture.findMany({
            where: { leagueId: team.leagueId },
            select: {
              id: true,
              kickoffAt: true,
              status: true,
              homeTeam: { select: { id: true } },
              awayTeam: { select: { id: true } },
              result: { select: { homeScore: true, awayScore: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const scheduledFixtures = fixtures.filter(
      (fixture) => fixture.status === "SCHEDULED",
    );

    await Promise.all(
      scheduledFixtures.map((fixture) => refreshStoredAiPreviewForFixture(fixture.id)),
    );

    const storedPreviews = await getStoredAiPreviewsByFixtureIds(
      fixtures.map((fixture) => fixture.id),
    );

    return NextResponse.json({
      teamId,
      fixtures: fixtures.map((fixture) => {
        const base = {
          id: fixture.id,
          kickoffAt: fixture.kickoffAt.toISOString(),
          status: fixture.status,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          homeTeam: toTeamBadge(fixture.homeTeam),
          awayTeam: toTeamBadge(fixture.awayTeam),
          fullLabel: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
          captainLabel:
            fixture.homeTeamId === teamId
              ? `vs ${fixture.awayTeam.name}`
              : `vs ${fixture.homeTeam.name}`,
        };

        if (fixture.status !== "SCHEDULED") {
          return {
            ...base,
            winChance: null,
          };
        }

        const winChance = calculateFixtureWinChance({
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          fixtures: leagueFixtures,
        });

        return {
          ...base,
          winChance: {
            ...winChance,
            aiPreview: storedPreviews.get(fixture.id) ?? null,
          },
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
