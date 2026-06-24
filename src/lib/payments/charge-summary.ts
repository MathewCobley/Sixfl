// ========================================
// File: src/lib/payments/charge-summary.ts
// ========================================

type TeamChargeForSummary = {
  amountPence: number;
  fixtureId?: string | null;
  status: string;
  transactions: Array<{
    amountPence: number;
    notes?: string | null;
  }>;
};

type PaidPlayerMatchFeeForSummary = {
  fixtureId: string;
  amountPence: number;
};

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
    totals.set(fee.fixtureId, (totals.get(fee.fixtureId) ?? 0) + fee.amountPence);

    return totals;
  }, new Map<string, number>());
}

export function getDisplayChargeStatus(input: {
  storedStatus: string;
  amountPence: number;
  paidPence: number;
}) {
  if (input.storedStatus === "VOID" || input.storedStatus === "PAID") {
    return input.storedStatus;
  }

  if (input.paidPence >= input.amountPence) {
    return "PAID";
  }

  if (input.paidPence > 0) {
    return "PART_PAID";
  }

  return input.storedStatus;
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

  return charges.map((charge) => {
    const directPaidPence = getDirectChargePaidTotal(charge.transactions);
    const playerPaidPence = charge.fixtureId
      ? playerMatchFeeTotalsByFixture.get(charge.fixtureId) ?? 0
      : 0;
    const paidPence = directPaidPence + playerPaidPence;
    const displayStatus = getDisplayChargeStatus({
      storedStatus: charge.status,
      amountPence: charge.amountPence,
      paidPence,
    });
    const outstandingPence = getDisplayChargeOutstandingPence({
      displayStatus,
      amountPence: charge.amountPence,
      paidPence,
    });

    return {
      charge,
      directPaidPence,
      playerPaidPence,
      paidPence,
      outstandingPence,
      displayStatus,
    };
  });
}
