// ========================================
// File: src/app/api/captain/team/[teamid]/outstanding-balance/route.ts
// ========================================

import { NextResponse } from "next/server";

import {
  formatPaymentMoney,
  getTeamPaymentLedger,
} from "@/lib/payments/team-payment-ledger";
import { requireCaptain } from "@/lib/requireCaptain";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const ledger = await getTeamPaymentLedger(teamid);

  if (!ledger) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  return NextResponse.json({
    outstandingPence: ledger.outstandingPence,
    outstandingLabel: formatPaymentMoney(ledger.outstandingPence),
    itemCount: ledger.openChargeCount,
    openChargeCount: ledger.openChargeCount,
    relatedTeamCount: ledger.relatedTeamIds.length,
    helper:
      ledger.openChargeCount > 0
        ? `${ledger.openChargeCount} open charge${ledger.openChargeCount === 1 ? "" : "s"}.`
        : "0 open charges.",
  });
}
