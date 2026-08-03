import { NextResponse } from "next/server";

import { TEAM_KIT_QUANTITY } from "@/lib/kits/constants";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type KitOfferRow = {
  wantsKitOffer: boolean;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const rows = await prisma.$queryRaw<KitOfferRow[]>`
    SELECT (
      EXISTS (
        SELECT 1
        FROM "InterestLead" offer_lead
        WHERE offer_lead."convertedTeamId" = ${teamid}
          AND offer_lead."wantsFreeKit" = TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM "Team" offer_team
        WHERE offer_team."id" = ${teamid}
          AND offer_team."wantsFreeKit" = TRUE
      )
    ) AS "wantsKitOffer"
  `;

  const wantsKitOffer = Boolean(rows[0]?.wantsKitOffer);

  return NextResponse.json({
    legacyOffer: false,
    wantsKitOffer,
    offerType: wantsKitOffer ? "FREE_KIT" : "STANDARD",
    kitPricePence: wantsKitOffer ? 0 : 2000,
    includedKitQuantity: wantsKitOffer ? TEAM_KIT_QUANTITY : 0,
    includedKitTotalPence: 0,
    extraKitPricePence: 2000,
  });
}
