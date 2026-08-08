// ========================================
// File: src/app/api/admin/teams/[teamId]/division/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import {
  getTeamCompetitionData,
  setSeasonTeamDivision,
} from "@/lib/league-season-teams";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type DivisionRow = {
  id: string;
  leagueId: string;
  name: string;
  slug: string;
  sortOrder: number;
  leagueName: string;
  leagueSeason: string | null;
};

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

async function getTeamDivisionData(teamId: string) {
  const teamData = await getTeamCompetitionData(teamId);
  if (!teamData) return null;

  const leagueId = teamData.currentLeagueId;
  const divisions = leagueId
    ? await prisma.$queryRaw<DivisionRow[]>(Prisma.sql`
        SELECT
          d."id",
          d."leagueId",
          d."name",
          d."slug",
          d."sortOrder",
          l."name" AS "leagueName",
          l."season" AS "leagueSeason"
        FROM "LeagueDivision" d
        JOIN "League" l ON l."id" = d."leagueId"
        WHERE d."leagueId" = ${leagueId}
          AND d."isActive" = true
        ORDER BY d."sortOrder" ASC, d."name" ASC
      `)
    : [];

  // Preserve the old response shape for callers, but source its current league
  // and division from the competition + LeagueSeasonTeam model.
  return {
    team: {
      id: teamData.id,
      leagueId,
      divisionId: teamData.divisionId,
    },
    divisions,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  await requireAdmin();

  const { teamId } = await params;
  const data = await getTeamDivisionData(teamId);

  if (!data) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  await requireAdmin();

  const { teamId } = await params;
  const body = (await request.json().catch(() => null)) as {
    divisionId?: unknown;
  } | null;
  const divisionId = getString(body?.divisionId);
  const data = await getTeamDivisionData(teamId);

  if (!data) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (!data.team.leagueId) {
    return NextResponse.json(
      { error: "Choose the team's competition before assigning a current-season division." },
      { status: 400 },
    );
  }

  if (divisionId) {
    const matchingDivision = data.divisions.find((division) => division.id === divisionId);
    if (!matchingDivision) {
      return NextResponse.json(
        { error: "Division must be an active division in the current season." },
        { status: 400 },
      );
    }
  }

  try {
    await setSeasonTeamDivision({
      leagueId: data.team.leagueId,
      teamId,
      divisionId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Division could not be updated.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, divisionId });
}
