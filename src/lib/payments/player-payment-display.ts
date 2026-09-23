import type { PaymentAudience } from "./payment-visibility";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCaptainAssignedPlayerFeePence, getPlayerFeeSubsidyPence } from "./player-fee-coverage";
import { money } from "./player-ledger";

type Fee = { amountPence: number; status: string; note?: string | null; captainAssignedAmountPence?: number | null };
type ReceiptState = { controlled: boolean; balancePence: number; receivedPence: number; captainReceivedPence: number };

/** Presentation only. Never repairs a historic amount, and never uses an assigned
 * share as proof that cash was received. All callers use the same receipt split. */
export function getPlayerPaymentDisplay(fee: Fee, state?: ReceiptState | null, audience: PaymentAudience = "player") {
  const showInternal = audience === "admin";
  const recordedByCaptain = fee.status === "WAIVED" && Boolean(fee.note?.includes("captain/organiser marked"));
  const received = state?.controlled ? state.receivedPence : fee.status === "PAID" ? fee.amountPence : 0;
  const captainReceived = state?.controlled ? state.captainReceivedPence : recordedByCaptain ? fee.amountPence : 0;
  const balance = state?.controlled ? state.balancePence : fee.status === "OPEN" ? fee.amountPence : 0;
  const subsidy = getPlayerFeeSubsidyPence(fee);
  const assigned = getCaptainAssignedPlayerFeePence(fee);
  const historyMismatch = !state?.controlled && fee.status === "PAID" && assigned > received + subsidy;
  const paid = received + captainReceived;
  const statusLabel = historyMismatch ? "Check balance" : balance > 0 ? paid > 0 ? "Part-paid" : "Awaiting payment"
    : subsidy > 0 ? showInternal ? "Settled with adjustment" : "Settled" : received > 0 && captainReceived === 0 ? "Paid online"
    : captainReceived > 0 ? received > 0 ? "Settled" : "Paid to captain" : fee.status === "CANCELLED" ? "Cancelled" : "No charge";
  // Text is audience-specific; the numeric accounting values below never change.
  // The default is safe for the player's own dashboard, including admin preview.
  const detail = historyMismatch
    ? showInternal ? `${money(received)} recorded paid; ${money(assigned)} assigned — difference needs review` : "Payment record needs review."
    : audience === "captain"
      ? `${money(received + subsidy)} applied to fixture${captainReceived ? ` · ${money(captainReceived)} paid to captain` : ""} · ${money(balance)} outstanding`
      : `${money(received)} received online${captainReceived ? ` + ${money(captainReceived)} received by captain` : ""}${showInternal && subsidy ? ` + ${money(subsidy)} SIXFL adjustment` : ""} · ${money(balance)} outstanding`;
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

/** An inactive token is not evidence that an unpaid fee was removed.
 * Resolve inferred legacy closure and settlement-triggered closure using the
 * same receipt/adjustment evidence as the fixture ledger. Explicit deletions
 * and replacements retain their own audit status. No financial records change.
 */
export function getLegacyPaymentLinkClosureContext(fee: Fee | null | undefined) {
  const note = fee?.note ?? "";
  if (/Cancelled by captain because the team fixture charge was already fully covered/i.test(note)) {
    return "Legacy bulk close by captain — the team fixture charge was already fully covered.";
  }
  if (/Voided:\s*Removed from captain squad payment collection/i.test(note)) {
    return "Player was removed from Squad Payments.";
  }
  if (/captain\/organiser marked/i.test(note)) {
    return "Captain/organiser marked this player as paid directly.";
  }
  if (/Zero-fee player share waived by SIXFL/i.test(note)) {
    return "No player payment was required.";
  }
  return null;
}

export function getPlayerPaymentLinkSettlementLabel(
  link: { isRemoved: boolean; removedAt: Date | null; removedReason: string | null; source: string },
  fee: Fee | null | undefined,
  state?: ReceiptState | null,
) {
  if (!fee) return null;
  const inferredLegacyClosure = link.source.endsWith("BACKFILL") && !link.removedAt;
  const settlementClosure = /after payment was recorded|no individual payment was required/i.test(link.removedReason ?? "");
  if (link.isRemoved && !inferredLegacyClosure && !settlementClosure) return null;
  const display = getPlayerPaymentDisplay(fee, state, "player");
  if (display.outstandingPence > 0 || display.review) return null;
  if (display.adjustmentPence > 0) return "Settled";
  if (display.receivedPence > 0 || display.captainReceivedPence > 0) return display.statusLabel;
  return null;
}
