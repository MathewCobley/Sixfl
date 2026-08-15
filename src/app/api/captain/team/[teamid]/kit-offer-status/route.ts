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

  // Existing/current kit orders retain the entitlement they were created with.
  // The admin expiry only removes an unclaimed free-kit entitlement. A team with
  // an expired offer and no order can still use the normal paid £20 kit flow.
  const suppressed = Boolean(row.freeKitOfferExpired && !row.hasExistingOrder);
  const existingEntitlement = Boolean(
    row.hasExistingOrder || (row.wantsFreeKit && !suppressed),
  );
  const offerAvailable = Boolean(
    row.hasExistingOrder ||
      (!suppressed && (row.leagueEnabled || row.wantsFreeKit)),
  );

  return NextResponse.json({
    offerAvailable,
    leagueEnabled: Boolean(row.leagueEnabled),
    existingEntitlement,
    suppressed,
    hasExistingOrder: Boolean(row.hasExistingOrder),
  });
}
