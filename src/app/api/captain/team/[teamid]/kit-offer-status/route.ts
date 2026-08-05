import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

type OfferRow = {
  teamId: string;
  wantsFreeKit: boolean;
  leagueEnabled: boolean;
  hasExistingOrder: boolean;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const rows = await prisma.$queryRaw<OfferRow[]>(Prisma.sql`
    SELECT
      team."id" AS "teamId",
      team."wantsFreeKit" AS "wantsFreeKit",
      COALESCE(league."freeKitOfferEnabled", TRUE) AS "leagueEnabled",
      EXISTS (
        SELECT 1 FROM "TeamKitOrder" kit_order WHERE kit_order."teamId" = team."id"
      ) AS "hasExistingOrder"
    FROM "Team" team
    LEFT JOIN "League" league ON league."id" = team."leagueId"
    WHERE team."id" = ${teamid}
    LIMIT 1
  `);

  const row = rows[0] ?? null;
  if (!row) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const offerAvailable = Boolean(
    row.leagueEnabled || row.wantsFreeKit || row.hasExistingOrder,
  );

  return NextResponse.json({
    offerAvailable,
    leagueEnabled: Boolean(row.leagueEnabled),
    existingEntitlement: Boolean(row.wantsFreeKit || row.hasExistingOrder),
  });
}
