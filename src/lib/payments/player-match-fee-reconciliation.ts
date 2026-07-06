// ========================================
// File: src/lib/payments/player-match-fee-reconciliation.ts
// ========================================

import { PaymentChargeStatus } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { syncFixtureOverpaymentCredit } from "@/lib/payments/team-credit-pot";
import { prisma } from "@/lib/prisma";

function getLondonDateKey(value: Date | null | undefined) {
  if (!value) return null;

  return formatDateTimeInLondon(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function appendCoveredNote(description: string | null, paidTotalPence: number) {
  const note = `Covered by player payments totalling £${(paidTotalPence / 100).toFixed(2)}.`;
  const cleaned = description?.trim();

  if (!cleaned) return note;
  if (cleaned.includes("Covered by player payments")) return cleaned;

  return `${cleaned}\n${note}`;
}

function appendOverpaymentNote(description: string | null, overpaymentPence: number) {
  if (overpaymentPence <= 0) return description;

  const note = `Overpayment of £${(overpaymentPence / 100).toFixed(2)} added to team pot.`;
  const cleaned = description?.trim();

  if (!cleaned) return note;
  if (cleaned.includes("added to team pot")) return cleaned;

  return `${cleaned}\n${note}`;
}

async function linkPlayerFeeTransactionsToCharge(input: {
  playerMatchFeeIds: string[];
  chargeId: string;
}) {
  for (const playerMatchFeeId of input.playerMatchFeeIds) {
    await prisma.paymentTransaction.updateMany({
      where: {
        chargeId: null,
        notes: {
          contains: `Player fee ID: ${playerMatchFeeId}`,
        },
      },
      data: {
        chargeId: input.chargeId,
      },
    });
  }
}

export async function reconcileFixtureChargeFromPlayerPayments(input: {
  teamId: string;
  fixtureId: string;
}) {
  const [fixture, paidFees] = await Promise.all([
    prisma.fixture.findFirst({
      where: {
        id: input.fixtureId,
        OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
      },
      select: {
        id: true,
        kickoffAt: true,
      },
    }),
    prisma.playerMatchFee.findMany({
      where: {
        teamId: input.teamId,
        fixtureId: input.fixtureId,
        status: "PAID",
      },
      select: {
        id: true,
        amountPence: true,
      },
    }),
  ]);

  if (!fixture) return null;

  const paidTotalPence = paidFees.reduce((sum, fee) => sum + fee.amountPence, 0);

  if (paidTotalPence <= 0) return null;

  const fixtureDateKey = getLondonDateKey(fixture.kickoffAt);
  const chargeStatuses = Object.values(PaymentChargeStatus).filter(
    (status) => status !== PaymentChargeStatus.VOID,
  );

  const charges = await prisma.paymentCharge.findMany({
    where: {
      teamId: input.teamId,
      status: { in: chargeStatuses },
      OR: [
        { fixtureId: input.fixtureId },
        ...(fixtureDateKey ? [{ dueDate: { not: null } }] : []),
      ],
    },
    select: {
      id: true,
      amountPence: true,
      description: true,
      fixtureId: true,
      dueDate: true,
    },
    orderBy: [{ fixtureId: "desc" }, { dueDate: "asc" }, { createdAt: "asc" }],
  });

  const matchingCharge =
    charges.find((charge) => charge.fixtureId === input.fixtureId) ??
    charges.find((charge) => getLondonDateKey(charge.dueDate) === fixtureDateKey) ??
    null;

  if (!matchingCharge) {
    return {
      chargeId: null,
      paidTotalPence,
      covered: false,
      overpaymentPence: 0,
    };
  }

  const overpaymentPence = Math.max(paidTotalPence - matchingCharge.amountPence, 0);

  await linkPlayerFeeTransactionsToCharge({
    playerMatchFeeIds: paidFees.map((fee) => fee.id),
    chargeId: matchingCharge.id,
  });

  await syncFixtureOverpaymentCredit({
    teamId: input.teamId,
    fixtureId: input.fixtureId,
    chargeId: matchingCharge.id,
    paidTotalPence,
    chargeAmountPence: matchingCharge.amountPence,
  });

  if (paidTotalPence < matchingCharge.amountPence) {
    return {
      chargeId: matchingCharge.id,
      paidTotalPence,
      covered: false,
      overpaymentPence,
    };
  }

  await prisma.paymentCharge.update({
    where: { id: matchingCharge.id },
    data: {
      status: "PAID",
      description: appendOverpaymentNote(
        appendCoveredNote(matchingCharge.description, paidTotalPence),
        overpaymentPence,
      ),
    },
  });

  await cancelQueuedMatchFeeNotificationDispatches([matchingCharge.id]);

  return {
    chargeId: matchingCharge.id,
    paidTotalPence,
    covered: true,
    overpaymentPence,
  };
}
