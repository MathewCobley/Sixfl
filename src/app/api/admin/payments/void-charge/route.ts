// ========================================
// File: src/app/api/admin/payments/void-charge/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "The charge could not be voided.";
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

  try {
    const charge = await prisma.paymentCharge.findUnique({
      where: { id: chargeId },
      select: {
        id: true,
        teamId: true,
        status: true,
        title: true,
        description: true,
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

    if (
      charge.status === "PAID" ||
      charge.status === "PART_PAID" ||
      paidTotalPence > 0
    ) {
      return NextResponse.json(
        {
          error:
            "This charge is paid or part-paid, so it has not been voided. Review or refund the recorded payment first.",
          paidTotalPence,
        },
        { status: 409 },
      );
    }

    const voidNote = `Voided: ${reason}`;
    const description = [charge.description?.trim(), voidNote]
      .filter(Boolean)
      .join("\n");

    await prisma.paymentCharge.update({
      where: { id: charge.id },
      data: {
        status: "VOID",
        description,
      },
    });

    await cancelQueuedMatchFeeNotificationDispatches([charge.id], prisma, {
      reason: `Team match fee charge voided by admin: ${reason}`,
    });

    revalidatePath("/admin/payments");
    revalidatePath(`/captain/team/${charge.teamId}/payments`);
    revalidatePath(`/captain/team/${charge.teamId}/match-fees`);

    return NextResponse.json({ ok: true, voided: true });
  } catch (error) {
    console.error("Failed to void payment charge", {
      chargeId,
      error,
    });

    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
