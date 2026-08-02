import { PlayerMatchFeeStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type OpenPlayerFeeSummary = {
  count: number;
  amountPence: number;
};

export async function getOpenPlayerFeeSummary(input: {
  teamId: string;
  membershipId: string;
}): Promise<OpenPlayerFeeSummary> {
  const result = await prisma.playerMatchFee.aggregate({
    where: {
      teamId: input.teamId,
      teamMemberId: input.membershipId,
      status: PlayerMatchFeeStatus.OPEN,
    },
    _count: { _all: true },
    _sum: { amountPence: true },
  });

  return {
    count: result._count._all,
    amountPence: result._sum.amountPence ?? 0,
  };
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export function formatOpenPlayerFeeRemovalMessage(input: {
  summary: OpenPlayerFeeSummary;
  playerName?: string | null;
}) {
  const playerName = input.playerName?.trim() || "This player";
  const feeLabel = input.summary.count === 1 ? "unpaid match fee" : "unpaid match fees";

  return `${playerName} has ${input.summary.count} ${feeLabel} totalling ${formatMoney(
    input.summary.amountPence,
  )} for this team. Collect, cancel or waive the fees before removing or moving the player.`;
}
