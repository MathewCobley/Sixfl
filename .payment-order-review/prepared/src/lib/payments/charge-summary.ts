// ========================================
// File: src/lib/payments/charge-summary.ts
// ========================================

import {
  getPlayerFeeCashReceivedPence,
  getPlayerFeeSubsidyPence,
} from "@/lib/payments/player-fee-coverage";
import {
  getLegacyAdminAdjustmentWaivedPence,
  getTeamChargeWaivedPence,
} from "@/lib/payments/team-charge-waivers";

type TeamChargeForSummary = {
  amountPence: number;
  fixtureId?: string | null;
  status: string;
  description?: string | null;
  transactions: Array<{
    amountPence: number;
    notes?: string | null;
  }>;
};

type PaidPlayerMatchFeeForSummary = {
  fixtureId: string;
  amountPence: number;
  status?: string;
  note?: string | null;
};

function normalisePlayerFeeForSummary(fee: PaidPlayerMatchFeeForSummary) {
  return {
    amountPence: fee.amountPence,
    status: fee.status ?? "PAID",
    note: fee.note ?? null,
  };
}

export function isPlayerMatchFeeTransaction(transaction: { notes?: string | null }) {
  const notes = transaction.notes?.toLowerCase() ?? "";

  return notes.includes("player match fee paid online") || notes.includes("player fee id:");
}

export function getDirectChargePaidTotal(
  transactions: Array<{ amountPence: number; notes?: string | null }>,
) {
  return transactions.reduce((sum, transaction) => {
    if (isPlayerMatchFeeTransaction(transaction)) {
      return sum;
    }

    return sum + transaction.amountPence;
  }, 0);
}

export function buildPaidPlayerMatchFeeTotalsByFixture(
  paidPlayerMatchFees: PaidPlayerMatchFeeForSummary[],
) {
  return paidPlayerMatchFees.reduce((totals, fee) => {
    const cashPence = getPlayerFeeCashReceivedPence(normalisePlayerFeeForSummary(fee));
    totals.set(fee.fixtureId, (totals.get(fee.fixtureId) ?? 0) + cashPence);

    return totals;
  }, new Map<string, number>());
}

function buildPlayerMatchFeeSubsidyTotalsByFixture(
  playerMatchFees: PaidPlayerMatchFeeForSummary[],
) {
  return playerMatchFees.reduce((totals, fee) => {
    const subsidyPence = getPlayerFeeSubsidyPence(normalisePlayerFeeForSummary(fee));
    totals.set(fee.fixtureId, (totals.get(fee.fixtureId) ?? 0) + subsidyPence);
    return totals;
  }, new Map<string, number>());
}

export function getDisplayChargeStatus(input: {
  storedStatus: string;
  amountPence: number;
  paidPence: number;
}) {
  // VOID is an explicit accounting decision and remains authoritative. PAID is
  // different: the charge total can legitimately increase afterwards (for example
  // when a £10 late-payment admin fee is applied). In that case the financial
  // coverage must reopen the charge instead of a stale PAID flag hiding the new
  // balance.
  if (input.storedStatus === "VOID") {
    return "VOID";
  }

  if (input.paidPence >= input.amountPence) {
    return "PAID";
  }

  if (input.paidPence > 0) {
    return "PART_PAID";
  }

  return "OPEN";
}

export function getDisplayChargeOutstandingPence(input: {
  displayStatus: string;
  amountPence: number;
  paidPence: number;
}) {
  if (input.displayStatus === "VOID" || input.displayStatus === "PAID") {
    return 0;
  }

  return Math.max(input.amountPence - input.paidPence, 0);
}

export function summariseChargesWithPlayerMatchFees<TCharge extends TeamChargeForSummary>(
  charges: TCharge[],
  paidPlayerMatchFees: PaidPlayerMatchFeeForSummary[],
) {
  const playerMatchFeeTotalsByFixture = buildPaidPlayerMatchFeeTotalsByFixture(
    paidPlayerMatchFees,
  );
  const playerMatchFeeSubsidyTotalsByFixture = buildPlayerMatchFeeSubsidyTotalsByFixture(
    paidPlayerMatchFees,
  );

  return charges.map((charge) => {
    const directPaidPence = getDirectChargePaidTotal(charge.transactions);
    const playerPaidPence = charge.fixtureId
      ? playerMatchFeeTotalsByFixture.get(charge.fixtureId) ?? 0
      : 0;
    const playerSubsidyPence = charge.fixtureId
      ? playerMatchFeeSubsidyTotalsByFixture.get(charge.fixtureId) ?? 0
      : 0;
    const paidPence = directPaidPence + playerPaidPence;
    const coveredPence = paidPence + playerSubsidyPence;
    const waivedPence =
      getTeamChargeWaivedPence(charge.description) +
      getLegacyAdminAdjustmentWaivedPence(charge.description, charge.amountPence);
    const settledPence = coveredPence + waivedPence;
    const displayStatus = getDisplayChargeStatus({
      storedStatus: charge.status,
      amountPence: charge.amountPence,
      paidPence: settledPence,
    });
    const outstandingPence = getDisplayChargeOutstandingPence({
      displayStatus,
      amountPence: charge.amountPence,
      paidPence: settledPence,
    });

    return {
      charge,
      directPaidPence,
      playerPaidPence,
      playerSubsidyPence,
      paidPence,
      coveredPence,
      waivedPence,
      settledPence,
      outstandingPence,
      displayStatus,
    };
  });
}
