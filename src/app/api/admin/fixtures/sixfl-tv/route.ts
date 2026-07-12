import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FlagRow = {
  id: string;
  sixflTvRecorded: boolean;
};

export async function GET() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<FlagRow[]>(Prisma.sql`
    SELECT "id", "sixflTvRecorded"
    FROM "Fixture"
    WHERE "sixflTvRecorded" = true
  `);

  return NextResponse.json({ fixtureIds: rows.map((row) => row.id) });
}

export async function POST(request: Request) {
  await requireAdmin();

  const body = (await request.json().catch(() => null)) as {
    fixtureId?: string;
    sixflTvRecorded?: boolean;
  } | null;

  const fixtureId = body?.fixtureId?.trim() ?? "";
  if (!fixtureId) {
    return NextResponse.json({ error: "Fixture ID is required." }, { status: 400 });
  }

  const sixflTvRecorded = body?.sixflTvRecorded === true;

  const rows = await prisma.$queryRaw<FlagRow[]>(Prisma.sql`
    UPDATE "Fixture"
    SET "sixflTvRecorded" = ${sixflTvRecorded}, "updatedAt" = NOW()
    WHERE "id" = ${fixtureId}
    RETURNING "id", "sixflTvRecorded"
  `);

  if (!rows[0]) {
    return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
