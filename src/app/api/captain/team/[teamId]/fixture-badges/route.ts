// ========================================
// File: src/app/api/captain/team/[teamId]/fixture-badges/route.ts
// ========================================

import { NextResponse } from "next/server";

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
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  try {
    await requireCaptain(teamId);

    const fixtures = await prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      orderBy: [{ kickoffAt: "desc" }],
      take: 100,
      select: {
        id: true,
        kickoffAt: true,
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
    });

    return NextResponse.json({
      teamId,
      fixtures: fixtures.map((fixture) => ({
        id: fixture.id,
        kickoffAt: fixture.kickoffAt.toISOString(),
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeTeam: toTeamBadge(fixture.homeTeam),
        awayTeam: toTeamBadge(fixture.awayTeam),
        fullLabel: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
        captainLabel:
          fixture.homeTeamId === teamId
            ? `vs ${fixture.awayTeam.name}`
            : `vs ${fixture.homeTeam.name}`,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
