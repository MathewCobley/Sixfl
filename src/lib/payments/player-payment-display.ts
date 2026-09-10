import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCaptainAssignedPlayerFeePence, getPlayerFeeSubsidyPence } from "./player-fee-coverage";
import { money } from "./player-ledger";

type Fee = { amountPence: number; status: string; note?: string | null; captainAssignedAmountPence?: number | null };
type ReceiptState = { controlled: boolean; balancePence: number; receivedPence: number; captainReceivedPence: number };

/** Presentation only. Never repairs a historic amount, and never uses an assigned
 * share as proof that cash was received. All callers use the same receipt split. */
export function getPlayerPaymentDisplay(fee: Fee, state?: ReceiptState | null) {
  const recordedByCaptain = fee.status === "WAIVED" && Boolean(fee.note?.includes("captain/organiser marked"));
  const received = state?.controlled ? state.receivedPence : fee.status === "PAID" ? fee.amountPence : 0;
  const captainReceived = state?.controlled ? state.captainReceivedPence : recordedByCaptain ? fee.amountPence : 0;
  const balance = state?.controlled ? state.balancePence : fee.status === "OPEN" ? fee.amountPence : 0;
  const subsidy = getPlayerFeeSubsidyPence(fee);
  const assigned = getCaptainAssignedPlayerFeePence(fee);
  const historyMismatch = !state?.controlled && fee.status === "PAID" && assigned > received + subsidy;
  const paid = received + captainReceived;
  const statusLabel = historyMismatch ? "Check balance" : balance > 0 ? paid > 0 ? "Part-paid" : "Awaiting payment"
    : subsidy > 0 ? "Settled with adjustment" : received > 0 && captainReceived === 0 ? "Paid online"
    : captainReceived > 0 ? received > 0 ? "Settled" : "Paid to captain" : fee.status === "CANCELLED" ? "Cancelled" : "No charge";
  const detail = historyMismatch ? `${money(received)} recorded paid; ${money(assigned)} assigned — difference needs review`
    : `${money(received)} received online${captainReceived ? ` + ${money(captainReceived)} received by captain` : ""}${subsidy ? ` + ${money(subsidy)} SIXFL adjustment` : ""} · ${money(balance)} outstanding`;
  // On a settled row display receipts, not a larger nominal assigned share.
  const amountPence = balance > 0 ? balance + paid : paid || fee.amountPence;
  // Fixture contribution is distinct from the player-facing charge/receipt
  // amount above. Captain-held money is not received by SIXFL until remitted.
  // Pending liabilities and unverified historic differences add no coverage.
  const fixtureContributionPence = received + subsidy;
  return { statusLabel, detail, amountPence, receivedPence: received, captainReceivedPence: captainReceived,
    fixtureContributionPence, adjustmentPence: subsidy, assignedPence: assigned,
    outstandingPence: balance, review: historyMismatch, tone: historyMismatch || balance > 0 ? "amber" : paid > 0 || subsidy > 0 ? "emerald" : "neutral" };
}

export async function getPlayerReceiptStates(feeIds: string[]) {
  const ids = [...new Set(feeIds)];
  if (!ids.length) return new Map<string, ReceiptState>();
  const rows = await prisma.$queryRaw<Array<ReceiptState & { feeId: string }>>(Prisma.sql`
    SELECT "feeId", controlled, "balancePence", "receivedPence", "captainReceivedPence"
    FROM "PlayerFeeLedgerState" WHERE "feeId" IN (${Prisma.join(ids)})`);
  return new Map(rows.map(row => [row.feeId, row]));
}
