import { NextResponse } from "next/server";

import { TEAM_KIT_QUANTITY } from "@/lib/kits/constants";
import { getTeamFreeKitOffer } from "@/lib/kits/free-kit-offer";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, { params }: { params: Promise<{ teamid: string }> }) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  const row = await getTeamFreeKitOffer(teamid);
  if (!row) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const wantsKitOffer = row.includedEligible;
  return NextResponse.json({
    legacyOffer: false, wantsKitOffer,
    offerType: wantsKitOffer ? "FREE_KIT" : "STANDARD",
    kitPricePence: wantsKitOffer ? 0 : 2000,
    includedKitQuantity: wantsKitOffer ? TEAM_KIT_QUANTITY : 0,
    includedKitTotalPence: 0,
    extraKitPricePence: 2000,
  }, { headers: { "Cache-Control": "no-store" } });
}
