// ========================================
// File: src/app/api/captain/team/[teamid]/league-position/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { getLeagueTable } from "@/lib/leagueTable";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatOrdinal(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;

  return `${value}th`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Could not load league position.";
}

async function getCurrentDivisionId(input: {
  currentLeagueId: string;
  relatedTeamIds: string[];
  fallbackDivisionId?: string | null;
}) {
  const seasonTeam = await prisma.leagueSeasonTeam.findFirst({
    where: {
      leagueId: input.currentLeagueId,
      teamId: {
        in: input.relatedTeamIds,
      },
      isActive: true,
    },
    select: {
      divisionId: true,
    },
  });

  return seasonTeam?.divisionId ?? input.fallbackDivisionId ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;

  try {
    await requireCaptain(teamid);

    const context = await getCaptainRelatedTeamContext(teamid);

    if (!context?.currentLeagueId) {
      return NextResponse.json({
        position: null,
        totalTeams: 0,
        label: null,
      });
    }

    const divisionId = await getCurrentDivisionId({
      currentLeagueId: context.currentLeagueId,
      relatedTeamIds: context.relatedTeamIds,
      fallbackDivisionId: context.team.divisionId,
    });

    const table = await getLeagueTable(context.currentLeagueId, {
      divisionId,
    });

    const positionIndex = table.findIndex((row) =>
      context.relatedTeamIds.includes(row.teamId),
    );

    if (positionIndex < 0 || table.length === 0) {
      return NextResponse.json({
        position: null,
        totalTeams: table.length,
        label: null,
      });
    }

    const position = positionIndex + 1;

    return NextResponse.json({
      position,
      totalTeams: table.length,
      label: `${formatOrdinal(position)} in table`,
      divisionId,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
