import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type OfferRow = { enabled: boolean };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const rows = await prisma.$queryRaw<OfferRow[]>(Prisma.sql`
    SELECT COALESCE("freeKitOfferEnabled", TRUE) AS "enabled"
    FROM "League"
    WHERE "slug" = ${slug}
    LIMIT 1
  `);
  const row = rows[0] ?? null;
  if (!row) return NextResponse.json({ error: "League not found" }, { status: 404 });
  return NextResponse.json({ enabled: Boolean(row.enabled) });
}
