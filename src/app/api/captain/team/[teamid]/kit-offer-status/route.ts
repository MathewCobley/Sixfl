import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

type OfferRow = {
  teamId: string;
  wantsFreeKit: boolean;
  leagueEnabled: boolean;
  hasExistingOrder: boolean;
  freeKitOfferExpired: boolean;
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
      COALESCE(team."wantsFreeKit", FALSE) AS "wantsFreeKit",
      COALESCE(league."freeKitOfferEnabled", TRUE) AS "leagueEnabled",
      team."freeKitOfferExpiredAt" IS NOT NULL AS "freeKitOfferExpired",
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

  // An existing/submitted kit order always remains visible. Otherwise a
  // team-specific admin expiry overrides the league offer and the old interest
  // checkbox without deleting that historical record.
  const existingEntitlement = Boolean(
    row.hasExistingOrder || (row.wantsFreeKit && !row.freeKitOfferExpired),
  );
  const offerAvailable = Boolean(
    row.hasExistingOrder ||
      (!row.freeKitOfferExpired && (row.leagueEnabled || row.wantsFreeKit)),
  );

  return NextResponse.json({
    offerAvailable,
    leagueEnabled: Boolean(row.leagueEnabled),
    existingEntitlement,
    suppressed: Boolean(row.freeKitOfferExpired),
    hasExistingOrder: Boolean(row.hasExistingOrder),
  });
}
