import { NextResponse } from "next/server";

import { reconcileZeroFeePlayerAdjustmentsForTeam } from "@/lib/payments/zero-fee-player-adjustments";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  const result = await reconcileZeroFeePlayerAdjustmentsForTeam(teamid);

  return NextResponse.json({
    ...result,
    adjustments: result.adjustments.map((adjustment) => ({
      ...adjustment,
      players: adjustment.players.map((player) => ({
        ...player,
        editHref: access.isAdmin
          ? `/captain/team/${teamid}/squad/${player.teamMemberId}/edit`
          : `/captain/team/${teamid}/captain-squad/${player.teamMemberId}/edit`,
      })),
      collectionHref: `/captain/team/${teamid}/player-payments?fixtureId=${encodeURIComponent(adjustment.fixtureId)}`,
    })),
  });
}
