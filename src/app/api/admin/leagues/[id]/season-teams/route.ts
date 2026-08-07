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

type CommunicationsOnlyTeam = {
  id: string;
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  divisionId: string | null;
  divisionName: string | null;
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

async function getCommunicationsOnlyAffiliates(leagueId: string) {
  return prisma.$queryRaw<CommunicationsOnlyTeam[]>(Prisma.sql`
    SELECT
      COALESCE(lst."id", ${"communications_"} || md5(t."id" || ':' || target."id")) AS "id",
      t."id" AS "teamId",
      t."name" AS "teamName",
      t."logoUrl",
      t."contactEmail",
      t."contactPhone",
      NULL::text AS "divisionId",
      NULL::text AS "divisionName"
    FROM "League" target
    JOIN "Team" t
      ON target."competitionId" IS NOT NULL
     AND t."competitionId" = target."competitionId"
    LEFT JOIN "LeagueSeasonTeam" lst
      ON lst."leagueId" = target."id"
     AND lst."teamId" = t."id"
    WHERE target."id" = ${leagueId}
      AND t."leagueId" IS NULL
      AND COALESCE(lst."isActive", false) = false
      AND COALESCE(t."isFixturePlaceholder", false) = false
    ORDER BY t."name" ASC
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
  const [league, divisions, teams, standardAffiliatedTeams, communicationsOnlyTeams] =
    await Promise.all([
      getLeague(id),
      getDivisions(id),
      getLeagueSeasonTeams({ leagueId: id }),
      getAffiliatedTeamsOutsideSeason(id),
      getCommunicationsOnlyAffiliates(id),
    ]);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  const affiliatedTeams = [
    ...standardAffiliatedTeams.map((team) => ({ ...team, canEnterSeason: true })),
    ...communicationsOnlyTeams.map((team) => ({
      ...team,
      canEnterSeason: false,
      affiliationLabel: "Communications only",
    })),
  ].sort((left, right) => left.teamName.localeCompare(right.teamName));

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

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { leagueId: true },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (!team.leagueId) {
    return NextResponse.json(
      {
        error:
          "This team is set to No league and is affiliated for communications only. Assign it to a league from the team page before entering a season or division.",
      },
      { status: 409 },
    );
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

  // Leaving a season changes participation only. Preserve the division on the
  // historical season row so standings/history and a later re-entry can still
  // recover the team's last known division safely.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "LeagueSeasonTeam"
    SET
      "isActive" = false,
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
