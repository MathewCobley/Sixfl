import { isPlayerMatchFeeTransaction } from "./charge-summary";
import { LEDGER_TRANSACTION_PREFIX } from "./player-ledger-markers";

export type PaymentReceipt = {
  id: string;
  amountPence: number;
  method: string;
  reference: string | null;
  notes: string | null;
  paidAt: Date;
};

/** Presentation only. Modern player allocations are already counted in
 * playerPaidPence by the canonical ledger. Their transaction record must never
 * be presented as an additional direct team payment. Preserve signed refunds.
 * Reuse the accounting markers; do not infer new receipts from names/amounts. */
export function getPaymentReceiptKind(payment: { notes?: string | null; reference?: string | null }) {
  if ((payment.notes ?? "").startsWith(LEDGER_TRANSACTION_PREFIX) || isPlayerMatchFeeTransaction(payment)) return "PLAYER" as const;
  if (payment.reference === "TEAM_CREDIT" || (payment.notes ?? "").toLowerCase().includes("team credit used")) return "TEAM_CREDIT" as const;
  return "TEAM" as const;
}

export function getPaymentReceiptPlayerFeeId(notes: string | null | undefined) {
  if ((notes ?? "").startsWith(LEDGER_TRANSACTION_PREFIX)) {
    return /Account fee reference:\s*([a-zA-Z0-9_-]+)/i.exec(notes ?? "")?.[1] ?? null;
  }
  return /Player fee ID:\s*([a-zA-Z0-9_-]+)/i.exec(notes ?? "")?.[1] ?? null;
}

export function getPaymentReceiptLabel(payment: { amountPence: number; notes?: string | null; reference?: string | null }, isKitCharge = false) {
  const kind = getPaymentReceiptKind(payment);
  if (kind === "PLAYER") return payment.amountPence < 0 ? "Player refund" : "Player payment";
  if (kind === "TEAM_CREDIT") return payment.amountPence < 0 ? "Team credit reversed" : "Team credit used";
  if (payment.amountPence < 0) return isKitCharge ? "Kit refund" : "Team refund";
  return isKitCharge ? "Kit payment" : "Direct team payment";
}

export type PlayerCollectionFigure = {
  amountPence: number;
  captainReceivedPence: number;
  outstandingPence: number;
};

/** Reconcile the displayed collection records, not a second charge calculator.
 * Captain-reported receipts remain historical reports, NOT cash still held:
 * a later remittance may already be included in the canonical team balance.
 * Excess/shortfall is explanatory only and must never create or forgive debt. */
export function getPlayerCollectionFigures(rows: PlayerCollectionFigure[], chargePence: number) {
  const receivedAndAdjustedPence = rows.reduce((sum, row) => sum + row.amountPence, 0);
  const captainReportedPence = rows.reduce((sum, row) => sum + row.captainReceivedPence, 0);
  const playerOutstandingPence = rows.reduce((sum, row) => sum + row.outstandingPence, 0);
  const representedPence = receivedAndAdjustedPence + captainReportedPence + playerOutstandingPence;
  return { receivedAndAdjustedPence, captainReportedPence, playerOutstandingPence, representedPence,
    excessPence: Math.max(representedPence - chargePence, 0) };
}
