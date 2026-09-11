import { PaymentChargeStatus, PlayerMatchFeeStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { summariseChargesWithPlayerMatchFees } from "@/lib/payments/charge-summary";
import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { syncTeamCreditLedgerSources } from "@/lib/payments/team-credits";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function getPositiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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

// Native admin fee-reduction boundary. The completed-fixture lock remains intact;
// only the two explicitly named accounting fields below may be reduced here.
class FeeReductionConflict extends Error {}

export async function POST(request: Request) {
  const { user } = await requireAdmin();

  const body = await request.json().catch(() => null);
  const chargeId = getString((body as { chargeId?: unknown } | null)?.chargeId);
  const reductionPence = getPositiveInt((body as { waivePence?: unknown } | null)?.waivePence);
  const reason = getString((body as { reason?: unknown } | null)?.reason);

  if (!chargeId || !reductionPence || !reason) {
    return NextResponse.json(
      { error: "Charge, reduction amount and reason are required." },
      { status: 400 },
    );
  }

  try {
    const charge = await prisma.paymentCharge.findUnique({
      where: { id: chargeId },
      include: {
        transactions: {
          select: { amountPence: true, notes: true },
        },
        fixture: {
          select: {
            id: true,
            homeTeamId: true,
            awayTeamId: true,
            homeMatchFeePence: true,
            awayMatchFeePence: true,
            matchFeePence: true,
          },
        },
      },
    });

    if (!charge) {
      return NextResponse.json({ error: "Charge not found." }, { status: 404 });
    }

    if (charge.status === PaymentChargeStatus.VOID) {
      return NextResponse.json(
        { error: "A void charge cannot be reduced." },
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

    if (charge.fixture && charge.fixture.homeTeamId !== charge.teamId && charge.fixture.awayTeamId !== charge.teamId) {
      throw new FeeReductionConflict("This charge is not linked to a current participant in the fixture. Review the charge before reducing it.");
    }

    const [summary] = summariseChargesWithPlayerMatchFees([charge], playerMatchFees);
    if (!summary) {
      return NextResponse.json({ error: "Charge summary could not be calculated." }, { status: 409 });
    }

    const appliedLateFeePence =
      charge.latePaymentFeeStatus === "APPLIED"
        ? Math.max(charge.latePaymentFeeAmountPence, 0)
        : 0;
    const fixtureBaseChargePence = charge.fixture
      ? charge.fixture.homeTeamId === charge.teamId
        ? charge.fixture.homeMatchFeePence ?? charge.fixture.matchFeePence
        : charge.fixture.awayTeamId === charge.teamId
          ? charge.fixture.awayMatchFeePence ?? charge.fixture.matchFeePence
          : null
      : null;
    const currentBaseChargePence =
      fixtureBaseChargePence ??
      Math.max(charge.amountPence - appliedLateFeePence, 0);

    if (reductionPence > currentBaseChargePence) {
      return NextResponse.json(
        {
          error: appliedLateFeePence > 0
            ? `The base match fee is only ${formatMoney(currentBaseChargePence)}. Use Waive admin fee if you want to remove the separate ${formatMoney(appliedLateFeePence)} late-payment fee.`
            : `You can reduce the match fee by up to ${formatMoney(currentBaseChargePence)}.`,
        },
        { status: 409 },
      );
    }

    const newBaseChargePence = currentBaseChargePence - reductionPence;
    const newAmountPence = newBaseChargePence + appliedLateFeePence;
    const coveredPence = summary.coveredPence;
    const settledPence = "settledPence" in summary ? Number(summary.settledPence) : coveredPence;
    const nextStatus =
      settledPence >= newAmountPence
        ? PaymentChargeStatus.PAID
        : settledPence > 0
          ? PaymentChargeStatus.PART_PAID
          : PaymentChargeStatus.OPEN;

    const adjustmentNote = [
      `Admin match-fee reduction: ${formatMoney(reductionPence)}.`,
      `Base fixture charge changed from ${formatMoney(currentBaseChargePence)} to ${formatMoney(newBaseChargePence)}.`,
      appliedLateFeePence > 0
        ? `Separate late-payment admin fee remains ${formatMoney(appliedLateFeePence)}.`
        : null,
      `Reason: ${reason}`,
      `Recorded at ${new Date().toISOString()} by admin ${user?.id ?? "administrator"}.`,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ");
    const description = [charge.description?.trim(), adjustmentNote]
      .filter(Boolean)
      .join("\n");

    await prisma.$transaction(async (tx) => {
      if (charge.fixture) {
        // Deliberate fee-only accounting write, not a general fixture unlock.
        // Parameterised SQL changes only this team's base fee and audit timestamp.
        // Compare the original fee so concurrent reductions cannot overwrite one
        // another. A later conflict rolls back BOTH the fixture fee and charge.
        const changed = charge.fixture.homeTeamId === charge.teamId
          ? await tx.$executeRaw`
              UPDATE "Fixture" SET "homeMatchFeePence" = ${newBaseChargePence}, "updatedAt" = NOW()
              WHERE "id" = ${charge.fixture.id} AND "homeTeamId" = ${charge.teamId}
                AND COALESCE("homeMatchFeePence", "matchFeePence", ${currentBaseChargePence}) = ${currentBaseChargePence}
            `
          : await tx.$executeRaw`
              UPDATE "Fixture" SET "awayMatchFeePence" = ${newBaseChargePence}, "updatedAt" = NOW()
              WHERE "id" = ${charge.fixture.id} AND "awayTeamId" = ${charge.teamId}
                AND COALESCE("awayMatchFeePence", "matchFeePence", ${currentBaseChargePence}) = ${currentBaseChargePence}
            `;
        if (changed !== 1) {
          throw new FeeReductionConflict("The fixture fee changed while you were reducing it. Reload Payments and check the current amount.");
        }
      }

      const changedCharge = await tx.paymentCharge.updateMany({
        where: { id: charge.id, updatedAt: charge.updatedAt, amountPence: charge.amountPence, status: charge.status },
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
      if (changedCharge.count !== 1) {
        throw new FeeReductionConflict("The charge changed while you were reducing it. Reload Payments and check the current amount.");
      }
    });

    await cancelQueuedMatchFeeNotificationDispatches([charge.id], prisma, {
      reason: `Base match fee reduced by admin: ${formatMoney(reductionPence)}.`,
    });

    // If the team has already paid more than the newly reduced charge, refresh
    // the standard-team credit ledger immediately. Managed teams are ignored by
    // the credit policy.
    await syncTeamCreditLedgerSources([charge.teamId]);

    revalidatePath("/admin/payments");
    revalidatePath("/admin/fixtures");
    revalidatePath("/admin/night-board");
    revalidatePath("/admin/payments/team-credits");
    revalidatePath("/admin/fixtures/late-fees");
    revalidatePath(`/captain/team/${charge.teamId}`);
    revalidatePath(`/captain/team/${charge.teamId}/payments`);
    revalidatePath(`/captain/team/${charge.teamId}/player-payments`);
    revalidatePath(`/captain/team/${charge.teamId}/match-fees`);

    return NextResponse.json({
      ok: true,
      chargeId: charge.id,
      reductionPence,
      oldBaseChargePence: currentBaseChargePence,
      newBaseChargePence,
      latePaymentFeePence: appliedLateFeePence,
      newAmountPence,
      outstandingPence: Math.max(newAmountPence - settledPence, 0),
      status: nextStatus,
    });
  } catch (error) {
    console.error("Failed to adjust payment charge", {
      chargeId,
      reductionPence,
      error,
    });

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: error instanceof FeeReductionConflict ? 409 : 500 },
    );
  }
}
