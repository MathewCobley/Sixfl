// ========================================
// File: src/lib/payments/player-match-fee-reconciliation.ts
// ========================================

import { PaymentChargeStatus } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
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

function appendPartPaidNote(description: string | null, paidTotalPence: number) {
  const note = `Part-covered by player payments totalling £${(paidTotalPence / 100).toFixed(2)}.`;
  const cleaned = description?.trim();

  if (!cleaned) return note;
  if (cleaned.includes("Part-covered by player payments") || cleaned.includes("Covered by player payments")) {
    return cleaned;
  }

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
  const reconcilableStatuses: PaymentChargeStatus[] = ["OPEN", "PART_PAID", "PAID"];

  const charges = await prisma.paymentCharge.findMany({
    where: {
      teamId: input.teamId,
      status: { in: reconcilableStatuses },
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
      status: true,
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
    };
  }

  const isCovered = paidTotalPence >= matchingCharge.amountPence;
  const nextStatus: PaymentChargeStatus = isCovered ? "PAID" : "PART_PAID";

  await linkPlayerFeeTransactionsToCharge({
    playerMatchFeeIds: paidFees.map((fee) => fee.id),
    chargeId: matchingCharge.id,
  });

  await prisma.paymentCharge.update({
    where: { id: matchingCharge.id },
    data: {
      fixtureId: matchingCharge.fixtureId ?? input.fixtureId,
      status: nextStatus,
      description: isCovered
        ? appendCoveredNote(matchingCharge.description, paidTotalPence)
        : appendPartPaidNote(matchingCharge.description, paidTotalPence),
    },
  });

  if (isCovered) {
    await cancelQueuedMatchFeeNotificationDispatches([matchingCharge.id]);
  }

  return {
    chargeId: matchingCharge.id,
    paidTotalPence,
    covered: isCovered,
  };
}
