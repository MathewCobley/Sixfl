import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type LeagueOfferRow = {
  id: string;
  name: string;
  enabled: boolean;
};

async function getLeague(id: string) {
  const rows = await prisma.$queryRaw<LeagueOfferRow[]>(Prisma.sql`
    SELECT
      "id",
      "name",
      COALESCE("freeKitOfferEnabled", TRUE) AS "enabled"
    FROM "League"
    WHERE "id" = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const league = await getLeague(id);
  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  return NextResponse.json(league);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const updated = await prisma.$queryRaw<LeagueOfferRow[]>(Prisma.sql`
    UPDATE "League"
    SET "freeKitOfferEnabled" = ${body.enabled}, "updatedAt" = NOW()
    WHERE "id" = ${id}
    RETURNING "id", "name", "freeKitOfferEnabled" AS "enabled"
  `);
  const league = updated[0] ?? null;
  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });

  if (!body.enabled) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Team" team
      SET "wantsFreeKit" = FALSE, "updatedAt" = NOW()
      WHERE team."leagueId" = ${id}
        AND team."wantsFreeKit" = TRUE
        AND NOT EXISTS (
          SELECT 1
          FROM "TeamKitOrder" kit_order
          WHERE kit_order."teamId" = team."id"
        )
    `);
  }

  return NextResponse.json(league);
}
