export const PLAYER_LEDGER_RECEIPT_MARKER = "[SIXFL_PLAYER_LEDGER_RECEIPTS]";
export const LEDGER_TRANSACTION_PREFIX = "Player ledger repayment";
export const hasPlayerLedgerReceipts = (note?: string | null) => (note ?? "").includes(PLAYER_LEDGER_RECEIPT_MARKER);
export function getPlayerLedgerTransactionTotal(transactions: Array<{amountPence:number;notes?:string|null}>) {
  return transactions.reduce((sum,t) => sum + ((t.notes ?? "").startsWith(LEDGER_TRANSACTION_PREFIX) ? t.amountPence : 0),0);
}
