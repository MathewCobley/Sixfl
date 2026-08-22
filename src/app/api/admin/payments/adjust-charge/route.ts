// ========================================
// File: src/app/api/admin/payments/adjust-charge/route.ts
// ========================================

import { PaymentChargeStatus, PlayerMatchFeeStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { summariseChargesWithPlayerMatchFees } from "@/lib/payments/charge-summary";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function getPositiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "The charge could not be adjusted.";
}

export async function POST(request: Request) {
  await requireAdmin();

  const body = await request.json().catch(() => null);
  const chargeId = getString((body as { chargeId?: unknown } | null)?.chargeId);
  const waivePence = getPositiveInt((body as { waivePence?: unknown } | null)?.waivePence);
  const reason = getString((body as { reason?: unknown } | null)?.reason);

  if (!chargeId || !waivePence || !reason) {
    return NextResponse.json(
      { error: "Charge, waiver amount and reason are required." },
      { status: 400 },
    );
  }

  try {
    const charge = await prisma.paymentCharge.findUnique({
      where: { id: chargeId },
      include: {
        transactions: {
          select: {
            amountPence: true,
            notes: true,
          },
        },
      },
    });

    if (!charge) {
      return NextResponse.json({ error: "Charge not found." }, { status: 404 });
    }

    if (charge.status === PaymentChargeStatus.VOID) {
      return NextResponse.json(
        { error: "A void charge cannot be reduced or waived." },
        { status: 409 },
      );
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

    if (!summary || summary.outstandingPence <= 0) {
      return NextResponse.json(
        { error: "This charge has no outstanding amount to waive." },
        { status: 409 },
      );
    }

    if (waivePence > summary.outstandingPence) {
      return NextResponse.json(
        {
          error: `You can waive up to ${formatMoney(summary.outstandingPence)} on this charge.`,
        },
        { status: 409 },
      );
    }

    const oldAmountPence = charge.amountPence;
    const newAmountPence = oldAmountPence - waivePence;
    const nextStatus =
      newAmountPence <= summary.coveredPence
        ? PaymentChargeStatus.PAID
        : summary.coveredPence > 0
          ? PaymentChargeStatus.PART_PAID
          : PaymentChargeStatus.OPEN;

    const adjustmentNote = [
      `Admin fee adjustment: ${formatMoney(waivePence)} waived/reduced.`,
      `Charge changed from ${formatMoney(oldAmountPence)} to ${formatMoney(newAmountPence)}.`,
      `Reason: ${reason}`,
    ].join(" ");
    const description = [charge.description?.trim(), adjustmentNote]
      .filter(Boolean)
      .join("\n");

    await prisma.paymentCharge.update({
      where: { id: charge.id },
      data: {
        amountPence: newAmountPence,
        status: nextStatus,
        description,
        lastStripeCheckoutUrl: null,
        lastStripeCheckoutSessionId: null,
        lastStripeCheckoutCreatedAt: null,
        lastStripeCheckoutAmountPence: null,
      },
    });

    // Any already queued reminder may contain the pre-adjustment amount. Cancel it
    // so a captain is never chased for money that SIXFL has just waived.
    await cancelQueuedMatchFeeNotificationDispatches([charge.id], prisma, {
      reason: `Team charge adjusted by admin: ${formatMoney(waivePence)} waived/reduced.`,
    });

    revalidatePath("/admin/payments");
    revalidatePath(`/captain/team/${charge.teamId}`);
    revalidatePath(`/captain/team/${charge.teamId}/payments`);
    revalidatePath(`/captain/team/${charge.teamId}/match-fees`);

    return NextResponse.json({
      ok: true,
      chargeId: charge.id,
      waivedPence: waivePence,
      oldAmountPence,
      newAmountPence,
      outstandingPence: Math.max(newAmountPence - summary.coveredPence, 0),
      status: nextStatus,
    });
  } catch (error) {
    console.error("Failed to adjust payment charge", {
      chargeId,
      waivePence,
      error,
    });

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
