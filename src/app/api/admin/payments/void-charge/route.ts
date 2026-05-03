// ========================================
// File: src/app/api/admin/payments/void-charge/route.ts
// ========================================

import { NextResponse } from "next/server";

import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

export async function POST(request: Request) {
  await requireAdmin();

  const body = await request.json().catch(() => null);
  const chargeId = getString((body as { chargeId?: unknown } | null)?.chargeId);
  const reason =
    getString((body as { reason?: unknown } | null)?.reason) ??
    "Game conceded / fixture not played";

  if (!chargeId) {
    return NextResponse.json({ error: "Missing charge id." }, { status: 400 });
  }

  const charge = await prisma.paymentCharge.findUnique({
    where: { id: chargeId },
    select: {
      id: true,
      status: true,
      title: true,
      transactions: {
        select: {
          id: true,
          amountPence: true,
        },
      },
    },
  });

  if (!charge) {
    return NextResponse.json({ error: "Charge not found." }, { status: 404 });
  }

  if (charge.status === "VOID") {
    return NextResponse.json({ ok: true, voided: false, alreadyVoid: true });
  }

  const paidTotalPence = charge.transactions.reduce(
    (sum, transaction) => sum + transaction.amountPence,
    0,
  );

  if (paidTotalPence > 0) {
    return NextResponse.json(
      {
        error:
          "This charge already has a recorded payment, so it has not been voided. Review/refund it manually first.",
        paidTotalPence,
      },
      { status: 409 },
    );
  }

  await prisma.paymentCharge.update({
    where: { id: charge.id },
    data: {
      status: "VOID",
      description: `${charge.title}\nVoided: ${reason}`,
    },
  });

  await cancelQueuedMatchFeeNotificationDispatches([charge.id], prisma, {
    reason: `Team match fee charge voided by admin: ${reason}`,
  });

  return NextResponse.json({ ok: true, voided: true });
}
