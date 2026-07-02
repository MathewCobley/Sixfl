// ========================================
// File: src/app/api/admin/teams/[teamId]/standard-match-fee/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type Body = {
  standardMatchFeePounds?: unknown;
};

function parseMatchFeePence(value: unknown) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  const amount = Number(raw);

  if (!raw || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Standard match fee must be 0 or more.");
  }

  return Math.round(amount * 100);
}

function formatPounds(pence: number | null) {
  return ((pence ?? 4000) / 100).toFixed(2);
}

async function getTeamStandardFee(teamId: string) {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    standardMatchFeePence: number | null;
  }>>(Prisma.sql`
    SELECT "id", "name", "standardMatchFeePence"
    FROM "Team"
    WHERE "id" = ${teamId}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  await requireAdmin();

  const { teamId } = await params;
  const team = await getTeamStandardFee(teamId);

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  return NextResponse.json({
    teamId: team.id,
    teamName: team.name,
    standardMatchFeePence: team.standardMatchFeePence ?? 4000,
    standardMatchFeePounds: formatPounds(team.standardMatchFeePence),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  await requireAdmin();

  const { teamId } = await params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const standardMatchFeePence = parseMatchFeePence(body?.standardMatchFeePounds);

  const team = await getTeamStandardFee(teamId);

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Team"
    SET "standardMatchFeePence" = ${standardMatchFeePence}, "updatedAt" = NOW()
    WHERE "id" = ${teamId}
  `);

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${teamId}`);

  return NextResponse.json({
    ok: true,
    standardMatchFeePence,
    standardMatchFeePounds: formatPounds(standardMatchFeePence),
  });
}
