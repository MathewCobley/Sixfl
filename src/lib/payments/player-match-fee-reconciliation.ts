// ========================================
// File: src/lib/payments/player-match-fee-reconciliation.ts
// ========================================

import { getPlayerLedgerTransactionTotal } from "./player-ledger-markers";
import { summariseChargesWithPlayerMatchFees, getDirectChargePaidTotal } from "@/lib/payments/charge-summary";
import { PaymentChargeStatus } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import {
  getPlayerFeeCashReceivedPence,
  getPlayerFeeSubsidyPence,
} from "@/lib/payments/player-fee-coverage";
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

function appendCoveredNote(description: string | null, coveredTotalPence: number) {
  const note = `Covered by player shares totalling £${(coveredTotalPence / 100).toFixed(2)}.`;
  const cleaned = description?.trim();

  if (!cleaned) return note;
  if (cleaned.includes("Covered by player shares") || cleaned.includes("Covered by player payments")) {
    return cleaned;
  }

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
  const [fixture, playerFees] = await Promise.all([
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
        status: { in: ["PAID", "WAIVED"] },
      },
      select: {
        id: true,
        amountPence: true,
        status: true,
        note: true,
      },
    }),
  ]);

  if (!fixture) return null;

  const paidTotalPence = playerFees.reduce(
    (sum, fee) => sum + getPlayerFeeCashReceivedPence(fee),
    0,
  );
  const subsidyPence = playerFees.reduce(
    (sum, fee) => sum + getPlayerFeeSubsidyPence(fee),
    0,
  );
  const coveredTotalPence = paidTotalPence + subsidyPence;

  // Direct repayment receipts may exist while the individual fee is still OPEN.

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
      subsidyPence,
      coveredTotalPence,
      covered: false,
      overpaymentPence: 0,
    };
  }

  // Team credit is based on genuine money received only. A SIXFL subsidy can
  // cover a fixture but can never create an overpayment balance for the team.
  const overpaymentPence = Math.max(paidTotalPence - matchingCharge.amountPence, 0);

  await linkPlayerFeeTransactionsToCharge({
    playerMatchFeeIds: playerFees
      .filter((fee) => fee.status === "PAID")
      .map((fee) => fee.id),
    chargeId: matchingCharge.id,
  });

  await syncFixtureOverpaymentCredit({
    teamId: input.teamId,
    fixtureId: input.fixtureId,
    chargeId: matchingCharge.id,
    paidTotalPence,
    chargeAmountPence: matchingCharge.amountPence,
  });

  const repaymentTransactions = await prisma.paymentTransaction.findMany({
    where: {chargeId:matchingCharge.id,teamId:input.teamId}, select:{amountPence:true,notes:true},
  });
  const freshCharge = await prisma.paymentCharge.findUnique({
    where: { id: matchingCharge.id },
    select: { amountPence: true, fixtureId: true, status: true, description: true },
  });
  if (!freshCharge) return null;
  const summary = summariseChargesWithPlayerMatchFees(
    [{ ...freshCharge, transactions: repaymentTransactions }],
    playerFees.map(fee => ({ ...fee, fixtureId: input.fixtureId })),
  )[0];
  const covered = summary.displayStatus === "PAID";
  // A stale PAID flag is never authoritative over a remaining balance. Reconcile
  // both directions; refunds/partial receipts must remain collectible.
  if (freshCharge.status !== "VOID") {
    await prisma.paymentCharge.update({
      where: { id: matchingCharge.id },
      data: { status: summary.displayStatus as PaymentChargeStatus },
    });
  }
  if (covered) await cancelQueuedMatchFeeNotificationDispatches([matchingCharge.id]);
  return {
    chargeId: matchingCharge.id,
    paidTotalPence: summary.playerPaidPence,
    subsidyPence: summary.playerSubsidyPence,
    coveredTotalPence: summary.coveredPence,
    covered,
    overpaymentPence,
  };
}
