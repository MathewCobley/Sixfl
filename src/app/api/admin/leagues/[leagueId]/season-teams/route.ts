// ========================================
// File: src/app/api/admin/leagues/[leagueId]/season-teams/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import {
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

async function getLeague(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, season: true, slug: true },
  });
}

async function getDivisions(leagueId: string) {
  return prisma.$queryRaw<Array<{ id: string; name: string; slug: string; sortOrder: number }>>(Prisma.sql`
    SELECT "id", "name", "slug", "sortOrder"
    FROM "LeagueDivision"
    WHERE "leagueId" = ${leagueId}
      AND "isActive" = true
    ORDER BY "sortOrder" ASC, "name" ASC
  `);
}

function revalidateLeaguePaths(league: { id: string; slug: string }) {
  revalidatePath(`/admin/leagues/${league.id}`);
  revalidatePath(`/admin/leagues/${league.id}/communications`);
  revalidatePath(`/leagues/${league.slug}`);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  await requireAdmin();

  const { leagueId } = await params;
  const [league, divisions, teams] = await Promise.all([
    getLeague(leagueId),
    getDivisions(leagueId),
    getLeagueSeasonTeams({ leagueId }),
  ]);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  return NextResponse.json({ league, divisions, teams });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  await requireAdmin();

  const { leagueId } = await params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const teamId = getString(body?.teamId);
  const divisionId = getString(body?.divisionId);
  const league = await getLeague(leagueId);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  if (!teamId) {
    return NextResponse.json({ error: "Team is required." }, { status: 400 });
  }

  await setSeasonTeamDivision({ leagueId, teamId, divisionId });

  revalidateLeaguePaths(league);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  await requireAdmin();

  const { leagueId } = await params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const teamId = getString(body?.teamId);
  const league = await getLeague(leagueId);

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
    WHERE "leagueId" = ${leagueId}
      AND "teamId" = ${teamId}
  `);

  revalidateLeaguePaths(league);

  return NextResponse.json({ ok: true });
}
