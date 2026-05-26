// ========================================
// File: src/lib/payments/reconcile-player-match-fees.ts
// ========================================

import { PlayerMatchFeeStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const PLAYER_MATCH_FEE_SOURCE_TYPES = [
  "PLAYER_MATCH_FEE_REQUEST",
  "PLAYER_MATCH_FEE_CHASE_24H",
  "PLAYER_MATCH_FEE_CHASE_72H",
];

export async function reconcileOpenPlayerMatchFeesFromTransactions() {
  const openFees = await prisma.playerMatchFee.findMany({
    where: { status: PlayerMatchFeeStatus.OPEN },
    select: { id: true, amountPence: true },
    take: 250,
  });

  let reconciled = 0;

  for (const fee of openFees) {
    const payment = await prisma.paymentTransaction.findFirst({
      where: {
        amountPence: { gte: fee.amountPence },
        notes: { contains: `Player fee ID: ${fee.id}` },
      },
      select: { id: true, paidAt: true },
      orderBy: { paidAt: "desc" },
    });

    if (!payment) continue;

    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: PlayerMatchFeeStatus.PAID,
        paidAt: payment.paidAt,
        waivedAt: null,
        cancelledAt: null,
      },
    });

    await prisma.notificationDispatch.updateMany({
      where: {
        sourceType: { in: PLAYER_MATCH_FEE_SOURCE_TYPES },
        sourceId: fee.id,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
      data: {
        status: "CANCELLED",
        failureReason: "Player match fee has been paid.",
      },
    });

    reconciled += 1;
  }

  return { scanned: openFees.length, reconciled };
}
