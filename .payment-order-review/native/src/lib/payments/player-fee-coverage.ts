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
}) {
  const match = CAP_NOTE_PATTERN.exec(input.note ?? "");
  if (!match) return input.amountPence;

  return parsePoundsToPence(match[1]) ?? input.amountPence;
}

export function getPlayerFeeSubsidyPence(input: {
  amountPence: number;
  status: string;
  note?: string | null;
}) {
  if (
    input.status === "WAIVED" &&
    Boolean(input.note?.includes(ZERO_FEE_WAIVER_NOTE))
  ) {
    return input.amountPence;
  }

  if (
    input.status === "PAID" &&
    Boolean(input.note?.includes(PLAYER_FEE_CAP_NOTE))
  ) {
    return Math.max(
      getCaptainAssignedPlayerFeePence(input) - input.amountPence,
      0,
    );
  }

  return 0;
}

export function getPlayerFeeCashReceivedPence(input: {
  amountPence: number;
  status: string;
}) {
  return input.status === "PAID" ? input.amountPence : 0;
}

export function getPlayerFeeCoveragePence(input: {
  amountPence: number;
  status: string;
  note?: string | null;
}) {
  return (
    getPlayerFeeCashReceivedPence(input) +
    getPlayerFeeSubsidyPence(input)
  );
}
