// ========================================
// File: src/app/api/admin/leagues/[id]/season-teams/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import {
  getAffiliatedTeamsOutsideSeason,
  getLeagueSeasonTeams,
  setSeasonTeamDivision,
} from "@/lib/league-season-teams";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type Body = {
  teamId?: unknown;
  divisionId?: unknown;
};

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

async function getLeague(id: string) {
  return prisma.league.findUnique({
    where: { id },
    select: { id: true, name: true, season: true, slug: true },
  });
}

async function getDivisions(id: string) {
  return prisma.$queryRaw<Array<{ id: string; name: string; slug: string; sortOrder: number }>>(Prisma.sql`
    SELECT "id", "name", "slug", "sortOrder"
    FROM "LeagueDivision"
    WHERE "leagueId" = ${id}
      AND "isActive" = true
    ORDER BY "sortOrder" ASC, "name" ASC
  `);
}

function revalidateLeaguePaths(league: { id: string; slug: string }) {
  revalidatePath(`/admin/leagues/${league.id}`);
  revalidatePath(`/admin/leagues/${league.id}/communications`);
  revalidatePath(`/leagues/${league.slug}`);
  revalidatePath("/admin/teams");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const [league, divisions, teams, affiliatedTeams] = await Promise.all([
    getLeague(id),
    getDivisions(id),
    getLeagueSeasonTeams({ leagueId: id }),
    getAffiliatedTeamsOutsideSeason(id),
  ]);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  return NextResponse.json({ league, divisions, teams, affiliatedTeams });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const teamId = getString(body?.teamId);
  const divisionId = getString(body?.divisionId);
  const league = await getLeague(id);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  if (!teamId) {
    return NextResponse.json({ error: "Team is required." }, { status: 400 });
  }

  await setSeasonTeamDivision({ leagueId: id, teamId, divisionId });

  revalidateLeaguePaths(league);
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/player-pool`);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const teamId = getString(body?.teamId);
  const league = await getLeague(id);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  if (!teamId) {
    return NextResponse.json({ error: "Team is required." }, { status: 400 });
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "LeagueSeasonTeam"
    SET
      "isActive" = false,
      "divisionId" = NULL,
      "updatedAt" = NOW()
    WHERE "leagueId" = ${id}
      AND "teamId" = ${teamId}
  `);

  revalidateLeaguePaths(league);
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/player-pool`);

  return NextResponse.json({ ok: true });
}
