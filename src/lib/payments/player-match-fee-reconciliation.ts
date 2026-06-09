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
        amountPence: true,
      },
    }),
  ]);

  if (!fixture) return null;

  const paidTotalPence = paidFees.reduce((sum, fee) => sum + fee.amountPence, 0);

  if (paidTotalPence <= 0) return null;

  const fixtureDateKey = getLondonDateKey(fixture.kickoffAt);
  const openStatuses: PaymentChargeStatus[] = ["OPEN", "PART_PAID"];

  const charges = await prisma.paymentCharge.findMany({
    where: {
      teamId: input.teamId,
      status: { in: openStatuses },
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

  if (!matchingCharge || paidTotalPence < matchingCharge.amountPence) {
    return {
      chargeId: matchingCharge?.id ?? null,
      paidTotalPence,
      covered: false,
    };
  }

  await prisma.paymentCharge.update({
    where: { id: matchingCharge.id },
    data: {
      status: "PAID",
      description: appendCoveredNote(matchingCharge.description, paidTotalPence),
    },
  });

  await cancelQueuedMatchFeeNotificationDispatches([matchingCharge.id]);

  return {
    chargeId: matchingCharge.id,
    paidTotalPence,
    covered: true,
  };
}
