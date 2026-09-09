import { hasPlayerLedgerReceipts } from "./player-ledger-markers";
// ========================================
// File: src/lib/payments/player-fee-coverage.ts
// ========================================

export const ZERO_FEE_WAIVER_NOTE = "Zero-fee player share waived by SIXFL";
export const PLAYER_FEE_CAP_NOTE = "Player fee cap applied";

const CAP_NOTE_PATTERN =
  /Player fee cap applied: captain share £([0-9,.]+); player charged £([0-9,.]+)\./i;

function parsePoundsToPence(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function getCaptainAssignedPlayerFeePence(input: {
  amountPence: number;
  note?: string | null;
  captainAssignedAmountPence?: number | null;
}) {
  if (typeof input.captainAssignedAmountPence === "number" && Number.isSafeInteger(input.captainAssignedAmountPence) && input.captainAssignedAmountPence >= 0) return input.captainAssignedAmountPence;
  const match = CAP_NOTE_PATTERN.exec(input.note ?? "");
  if (!match) return input.amountPence;

  return parsePoundsToPence(match[1]) ?? input.amountPence;
}

/** A stored, server-authored cap agreement is evidence; a numeric difference
 * by itself is not. The allowance is the FIXED authorised difference and only
 * settles once the agreed player portion is paid. Partial receipts add no subsidy. */
export function getPlayerFeeSubsidyPence(input: {
  amountPence: number; status: string; note?: string | null;
  captainAssignedAmountPence?: number | null;
}) {
  if (input.status === "WAIVED" && Boolean(input.note?.includes(ZERO_FEE_WAIVER_NOTE))) return input.amountPence;
  if (input.status !== "PAID") return 0;
  const agreement = CAP_NOTE_PATTERN.exec(input.note ?? "");
  if (!agreement) return 0;
  const assigned = parsePoundsToPence(agreement[1]);
  const payable = parsePoundsToPence(agreement[2]);
  if (assigned === null || payable === null || payable <= 0 || assigned <= payable || input.amountPence < payable) return 0;
  return assigned - payable;
}

export function getPlayerFeeCashReceivedPence(input: {
  amountPence: number;
  status: string;
  note?: string | null;
  captainAssignedAmountPence?: number | null;
}) {
  if (hasPlayerLedgerReceipts(input.note)) return 0;
  return input.status === "PAID" ? input.amountPence : 0;
}

export function getPlayerFeeCoveragePence(input: {
  amountPence: number;
  status: string;
  note?: string | null;
  captainAssignedAmountPence?: number | null;
}) {
  return (
    getPlayerFeeCashReceivedPence(input) +
    getPlayerFeeSubsidyPence(input)
  );
}
