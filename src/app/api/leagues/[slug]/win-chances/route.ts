// ========================================
// File: src/app/api/leagues/[slug]/win-chances/route.ts
// ========================================

import { NextResponse } from "next/server";

import {
  getStoredAiPreviewsByFixtureIds,
  refreshStoredAiPreviewForFixture,
} from "@/lib/fixtures/storedAiPredictions";
import { calculateFixtureWinChance } from "@/lib/fixtures/winChance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Could not load fixture win chances.";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const league = await prisma.league.findUnique({
      where: { slug },
      select: {
        id: true,
        fixtures: {
          where: {
            publishedAt: {
              not: null,
            },
          },
          select: {
            id: true,
            kickoffAt: true,
            status: true,
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
        },
      },
    });

    if (!league) {
      return NextResponse.json({ fixtures: [] }, { status: 404 });
    }

    const scheduledFixtures = league.fixtures.filter(
      (fixture) => fixture.status === "SCHEDULED",
    );

    await Promise.all(
      scheduledFixtures.map((fixture) => refreshStoredAiPreviewForFixture(fixture.id)),
    );

    const storedPreviews = await getStoredAiPreviewsByFixtureIds(
      scheduledFixtures.map((fixture) => fixture.id),
    );

    return NextResponse.json({
      fixtures: scheduledFixtures.map((fixture) => {
        const winChance = calculateFixtureWinChance({
          homeTeamId: fixture.homeTeam.id,
          awayTeamId: fixture.awayTeam.id,
          fixtures: league.fixtures,
        });

        return {
          id: fixture.id,
          homeTeamName: fixture.homeTeam.name,
          awayTeamName: fixture.awayTeam.name,
          fullLabel: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
          kickoffAt: fixture.kickoffAt.toISOString(),
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
