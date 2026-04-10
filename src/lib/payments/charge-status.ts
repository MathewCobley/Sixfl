// ========================================
// File: src/lib/payments/charge-status.ts
// ========================================

import { PaymentChargeStatus } from "@prisma/client";

export function getChargePaidTotal(
  transactions: Array<{ amountPence: number }>,
) {
  return transactions.reduce((sum, transaction) => sum + transaction.amountPence, 0);
}

export function getChargeOutstandingPence(
  amountPence: number,
  paidTotalPence: number,
) {
  return Math.max(amountPence - paidTotalPence, 0);
}

export function getChargeStatusFromAmounts(
  amountPence: number,
  paidTotalPence: number,
): PaymentChargeStatus {
  if (paidTotalPence >= amountPence) {
    return PaymentChargeStatus.PAID;
  }

  if (paidTotalPence > 0) {
    return PaymentChargeStatus.PART_PAID;
  }

  return PaymentChargeStatus.OPEN;
}

export function summariseCharge(input: {
  amountPence: number;
  transactions: Array<{ amountPence: number }>;
}) {
  const paidTotalPence = getChargePaidTotal(input.transactions);
  const outstandingPence = getChargeOutstandingPence(
    input.amountPence,
    paidTotalPence,
  );
  const status = getChargeStatusFromAmounts(
    input.amountPence,
    paidTotalPence,
  );

  return {
    paidTotalPence,
    outstandingPence,
    status,
  };
}
