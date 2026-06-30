// ========================================
// File: src/app/api/admin/payments/void-cancelled-fixture-charges/route.ts
// ========================================

import { NextResponse } from "next/server";
import {
  FixtureStatus,
  NotificationDispatchStatus,
  PaymentChargeStatus,
} from "@prisma/client";

import { getChargePaidTotal } from "@/lib/payments/charge-status";
import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function POST() {
  await requireAdmin();

  const candidates = await prisma.paymentCharge.findMany({
    where: {
      status: { in: [PaymentChargeStatus.OPEN, PaymentChargeStatus.PART_PAID] },
      fixture: {
        status: FixtureStatus.CANCELLED,
      },
    },
    select: {
      id: true,
      transactions: {
        select: {
          amountPence: true,
        },
      },
    },
  });

  const voidableChargeIds = candidates
    .filter((charge) => getChargePaidTotal(charge.transactions) === 0)
    .map((charge) => charge.id);

  if (voidableChargeIds.length === 0) {
    return NextResponse.json({ voided: 0, skippedPaid: candidates.length });
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentCharge.updateMany({
      where: {
        id: { in: voidableChargeIds },
      },
      data: {
        status: PaymentChargeStatus.VOID,
      },
    });

    await tx.notificationDispatch.updateMany({
      where: {
        sourceType: {
          in: ["FIXTURE_MATCH_FEE", "FIXTURE_MATCH_FEE_REMINDER"],
        },
        sourceId: { in: voidableChargeIds },
        status: NotificationDispatchStatus.QUEUED,
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason: "Fixture was cancelled before queued match fee emails were sent.",
      },
    });
  });

  await cancelQueuedMatchFeeNotificationDispatches(voidableChargeIds, prisma, {
    reason: "Fixture was cancelled before queued match fee emails were sent.",
  });

  return NextResponse.json({
    voided: voidableChargeIds.length,
    skippedPaid: candidates.length - voidableChargeIds.length,
  });
}
