// ========================================
// File: src/lib/payments/match-day-billing.ts
// ========================================

import {
  parseLondonDateTime,
  toLondonDateInputValue,
} from "@/lib/datetime/london";

const MATCH_DAY_PAYMENT_REQUEST_TIME = "09:00";

function getLondonDateKey(value: Date) {
  return toLondonDateInputValue(value);
}

export function isMatchFeeChargeDueToday(
  dueDate: Date | null | undefined,
  now = new Date(),
) {
  if (!dueDate) return false;

  return getLondonDateKey(dueDate) === getLondonDateKey(now);
}

export function isMatchFeeChargePayable(
  dueDate: Date | null | undefined,
  now = new Date(),
) {
  if (!dueDate) return true;

  return getLondonDateKey(dueDate) <= getLondonDateKey(now);
}

export function getMatchFeePaymentRequestScheduledFor(
  kickoffAt: Date,
  now = new Date(),
) {
  if (isMatchFeeChargePayable(kickoffAt, now)) return now;

  return parseLondonDateTime(
    getLondonDateKey(kickoffAt),
    MATCH_DAY_PAYMENT_REQUEST_TIME,
  );
}

export function getMatchFeePaymentUnavailableReason(
  dueDate: Date | null | undefined,
  now = new Date(),
) {
  if (isMatchFeeChargeDueToday(dueDate, now)) return null;

  return "Match fee payments open on match day.";
}
