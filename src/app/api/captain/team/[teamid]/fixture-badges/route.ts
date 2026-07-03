// ========================================
// File: src/app/api/captain/team/[teamid]/fixture-badges/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { getFallbackFixtureAiPreview } from "@/lib/fixtures/aiPredictor";
import { getStoredAiPreviewsByFixtureIds } from "@/lib/fixtures/storedAiPredictions";
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

    const context = await getCaptainRelatedTeamContext(teamId);

    if (!context) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    const relatedTeamIdSet = new Set(context.relatedTeamIds);

    const fixtures = await prisma.fixture.findMany({
      where: {
        ...(context.currentLeagueId ? { leagueId: context.currentLeagueId } : {}),
        OR: [
          { homeTeamId: { in: context.relatedTeamIds } },
          { awayTeamId: { in: context.relatedTeamIds } },
        ],
        publishedAt: { not: null },
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
    });

    const predictorTeamIds = Array.from(
      new Set(fixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId])),
    );
    const predictionHistory = predictorTeamIds.length
      ? await prisma.fixture.findMany({
          where: {
            status: "COMPLETED",
            result: { isNot: null },
            OR: [
              { homeTeamId: { in: predictorTeamIds } },
              { awayTeamId: { in: predictorTeamIds } },
            ],
          },
          orderBy: [{ kickoffAt: "asc" }],
          take: 500,
          select: {
            id: true,
            kickoffAt: true,
            status: true,
            homeTeam: { select: { id: true } },
            awayTeam: { select: { id: true } },
            result: { select: { homeScore: true, awayScore: true } },
          },
        })
      : [];

    const storedPreviews = await getStoredAiPreviewsByFixtureIds(
      fixtures.map((fixture) => fixture.id),
    );

    return NextResponse.json({
      teamId,
      relatedTeamIds: context.relatedTeamIds,
      fixtures: fixtures.map((fixture) => {
        const isHomeTeam = relatedTeamIdSet.has(fixture.homeTeamId);
        const base = {
          id: fixture.id,
          kickoffAt: fixture.kickoffAt.toISOString(),
          status: fixture.status,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          homeTeam: toTeamBadge(fixture.homeTeam),
          awayTeam: toTeamBadge(fixture.awayTeam),
          fullLabel: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
          captainLabel: isHomeTeam
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
          fixtures: predictionHistory,
        });

        return {
          ...base,
          winChance: {
            ...winChance,
            aiPreview:
              storedPreviews.get(fixture.id) ??
              getFallbackFixtureAiPreview({
                homeTeamName: fixture.homeTeam.name,
                awayTeamName: fixture.awayTeam.name,
                winChance,
              }),
          },
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
