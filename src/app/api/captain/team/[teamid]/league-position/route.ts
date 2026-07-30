// ========================================
// File: src/app/api/captain/team/[teamid]/league-position/route.ts
// ========================================

import { NextResponse } from "next/server";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { getTeamStanding } from "@/lib/standings";
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

    const standing = await getTeamStanding({
      leagueId: context.currentLeagueId,
      teamIds: context.relatedTeamIds,
    });

    if (!standing.position) {
      return NextResponse.json({
        position: null,
        totalTeams: standing.totalTeams,
        label: null,
        divisionId: standing.divisionId,
        divisionName: standing.divisionName,
      });
    }

    return NextResponse.json({
      position: standing.position,
      totalTeams: standing.totalTeams,
      label: `${formatOrdinal(standing.position)} in table`,
      divisionId: standing.divisionId,
      divisionName: standing.divisionName,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
