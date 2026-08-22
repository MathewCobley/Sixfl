// ========================================
// File: src/app/api/admin/payments/void-charge/route.ts
// ========================================

import { PlayerMatchFeeStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { summariseChargesWithPlayerMatchFees } from "@/lib/payments/charge-summary";
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
      include: {
        transactions: {
          select: {
            id: true,
            amountPence: true,
            notes: true,
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

    const playerMatchFees = charge.fixtureId
      ? await prisma.playerMatchFee.findMany({
          where: {
            teamId: charge.teamId,
            fixtureId: charge.fixtureId,
            status: {
              in: [PlayerMatchFeeStatus.PAID, PlayerMatchFeeStatus.WAIVED],
            },
          },
          select: {
            fixtureId: true,
            amountPence: true,
            status: true,
            note: true,
          },
        })
      : [];

    const [summary] = summariseChargesWithPlayerMatchFees([charge], playerMatchFees);
    const coveredPence = summary?.coveredPence ?? 0;

    if (
      charge.status === "PAID" ||
      charge.status === "PART_PAID" ||
      coveredPence > 0
    ) {
      return NextResponse.json(
        {
          error:
            "This charge is paid or part-paid, so it has not been voided. Use Reduce / waive to write off only the outstanding balance instead.",
          paidTotalPence: coveredPence,
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
        lastStripeCheckoutUrl: null,
        lastStripeCheckoutSessionId: null,
        lastStripeCheckoutCreatedAt: null,
        lastStripeCheckoutAmountPence: null,
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
