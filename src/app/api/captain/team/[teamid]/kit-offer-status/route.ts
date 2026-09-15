import { NextRequest, NextResponse } from "next/server";

import { getTeamFreeKitOffer } from "@/lib/kits/free-kit-offer";
import { requireCaptain } from "@/lib/requireCaptain";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ teamid: string }> }) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  const row = await getTeamFreeKitOffer(teamid);
  if (!row) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const suppressed = Boolean(row.expiredAt && !row.hasRetainedOrder);
  return NextResponse.json({
    offerAvailable: row.includedEligible || (!suppressed && row.leagueEnabled),
    leagueEnabled: row.leagueEnabled,
    existingEntitlement: row.includedEligible,
    suppressed,
    hasExistingOrder: row.hasExistingOrder,
  }, { headers: { "Cache-Control": "no-store" } });
}
