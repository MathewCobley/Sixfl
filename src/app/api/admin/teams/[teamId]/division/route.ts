// ========================================
// File: src/app/api/admin/teams/[teamId]/division/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type TeamDivisionRow = {
  id: string;
  leagueId: string | null;
  divisionId: string | null;
};

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
  const teamRows = await prisma.$queryRaw<TeamDivisionRow[]>(Prisma.sql`
    SELECT "id", "leagueId", "divisionId"
    FROM "Team"
    WHERE "id" = ${teamId}
    LIMIT 1
  `);

  const team = teamRows[0] ?? null;
  if (!team) return null;

  const divisions = team.leagueId
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
        WHERE d."leagueId" = ${team.leagueId}
          AND d."isActive" = true
        ORDER BY d."sortOrder" ASC, d."name" ASC
      `)
    : [];

  return { team, divisions };
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

  if (!divisionId) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Team"
      SET "divisionId" = NULL, "updatedAt" = NOW()
      WHERE "id" = ${teamId}
    `);

    return NextResponse.json({ ok: true, divisionId: null });
  }

  if (!data.team.leagueId) {
    return NextResponse.json(
      { error: "Choose a league before assigning a division." },
      { status: 400 },
    );
  }

  const matchingDivision = data.divisions.find((division) => division.id === divisionId);
  if (!matchingDivision) {
    return NextResponse.json(
      { error: "Division must belong to the selected league." },
      { status: 400 },
    );
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Team"
    SET "divisionId" = ${divisionId}, "updatedAt" = NOW()
    WHERE "id" = ${teamId}
  `);

  return NextResponse.json({ ok: true, divisionId });
}
