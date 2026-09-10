import Link from "next/link";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getPaymentReceiptKind, getPaymentReceiptLabel, getPaymentReceiptPlayerFeeId, getPlayerCollectionFigures,
  type PaymentReceipt, type PlayerCollectionFigure } from "@/lib/payments/payment-receipt-presentation";

const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const date = (value: Date) => formatDateTimeInLondon(value, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

type ContributionRow = PlayerCollectionFigure & {
  id: string; name: string; contact: string | null;
  receivedPence: number; adjustmentPence: number;
  statusLabel: string; statusMeta: string; tone: string;
};

/** One owned responsive grid: each amount has one explicit meaning. The same
 * canonical display object supplies online receipts, adjustments and debt.
 * Captain reports never become SIXFL receipts through presentation. */
export function PlayerContributionTable({ rows, isAdmin }: { rows: ContributionRow[]; isAdmin: boolean }) {
  const total = rows.reduce((sum, row) => sum + row.amountPence, 0);
  const columns = "grid grid-cols-3 gap-3 sm:grid-cols-[minmax(140px,1.6fr)_repeat(3,minmax(0,1fr))] sm:gap-4";
  return <section aria-label="Player payments" className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20" data-readable-player-payments>
    <div className="border-b border-white/10 px-4 py-3">
      <h3 className="text-base font-semibold text-white">Player payments</h3>
      <p className="mt-1 text-sm leading-5 text-white/65">Only SIXFL receipts and recorded adjustments count towards the fixture.</p>
    </div>
    <div className={`${columns} hidden border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-semibold text-white/70 sm:grid`} aria-hidden="true">
      <span>Player</span><span className="text-right">Applied to fixture</span><span className="text-right">Paid to captain</span><span className="text-right">Player still owes</span>
    </div>
    <div className="divide-y divide-white/10">{rows.map(row => <div key={row.id} data-player-contribution-pence={row.amountPence} className={`${columns} px-4 py-4`}>
      <div className="col-span-3 min-w-0 sm:col-span-1">
        <p className="break-words text-sm font-semibold text-white">{row.name}</p>
        <p className={`mt-1 text-xs font-medium ${row.outstandingPence > 0 || row.statusLabel === "Check balance" ? "text-amber-100" : "text-emerald-100/80"}`}>{row.statusLabel}</p>
        {row.statusLabel === "Check balance" ? <p className="mt-2 text-xs leading-5 text-amber-100">{row.statusMeta}</p> : null}
        {row.contact ? <details className="mt-1 text-xs text-white/55"><summary className="cursor-pointer">Contact</summary><p className="mt-1 break-all">{row.contact}</p></details> : null}
        {isAdmin && row.statusLabel === "Check balance" ? <Link href={`/admin/payments/player-fees/${row.id}/correct-charge`} className="mt-2 inline-flex rounded-lg border border-amber-300/35 px-2 py-2 text-xs font-semibold text-amber-100">Correct original charge</Link> : null}
      </div>
      <div className="min-w-0 sm:text-right">
        <p className="mb-1 text-xs text-white/65 sm:sr-only">Applied to fixture</p>
        <p className="whitespace-nowrap text-base font-semibold tabular-nums text-white">{money(row.amountPence)}</p>
        {row.adjustmentPence > 0 ? <p className="mt-1 text-xs leading-5 text-white/65">{money(row.receivedPence)} received + {money(row.adjustmentPence)} adjustment</p> : null}
      </div>
      <div className="min-w-0 sm:text-right">
        <p className="mb-1 text-xs text-white/65 sm:sr-only">Paid to captain</p>
        <p data-player-captain-pence={row.captainReceivedPence} className="whitespace-nowrap text-base font-semibold tabular-nums text-white">{money(row.captainReceivedPence)}</p>
      </div>
      <div className="min-w-0 sm:text-right">
        <p className="mb-1 text-xs text-white/65 sm:sr-only">Player still owes</p>
        <p data-player-still-owes-pence={row.outstandingPence} className={`whitespace-nowrap text-base font-semibold tabular-nums ${row.outstandingPence > 0 ? "text-amber-100" : "text-white/65"}`}>{money(row.outstandingPence)}</p>
      </div>
    </div>)}</div>
    <div data-player-contributions-total={total} className="flex items-center justify-between gap-4 border-t border-white/10 bg-white/[0.03] px-4 py-4 text-sm font-semibold text-white">
      <span className="min-w-0">Total applied from players and adjustments</span><span className="shrink-0 whitespace-nowrap tabular-nums">{money(total)}</span>
    </div>
  </section>;
}

export function PaymentReceiptDetails({ payments, playerNames, title, isKitCharge = false }: {
  payments: PaymentReceipt[]; playerNames: Map<string, { payerName: string }>; title: string; isKitCharge?: boolean;
}) {
  if (!payments.length) return null;
  return <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4" data-payment-receipt-details>
    <summary className="cursor-pointer text-sm font-semibold text-white/85">{title}</summary>
    <p className="mt-2 text-sm leading-5 text-white/65">Receipt history only. These amounts are already in the totals above — do not add them again.</p>
    <div className="mt-3 divide-y divide-white/10">{payments.map(payment => {
      const kind = getPaymentReceiptKind(payment);
      const feeId = getPaymentReceiptPlayerFeeId(payment.notes);
      const player = feeId ? playerNames.get(feeId) : null;
      return <div key={payment.id} data-receipt-kind={kind} data-receipt-amount={payment.amountPence} className="flex items-start justify-between gap-4 py-3 text-sm leading-5">
        <div className="min-w-0">
          <p className="font-semibold text-white">{getPaymentReceiptLabel(payment, isKitCharge)}{player ? ` — ${player.payerName}` : ""}</p>
          <p className="mt-1 text-xs text-white/65">{payment.method.replaceAll("_", " ")} · {date(payment.paidAt)}</p>
          {kind === "PLAYER" ? <p className="mt-1 text-xs text-emerald-100/70">Included in player total; not a second team payment.</p> : null}
          {payment.reference ? <p className="mt-1 break-all text-xs text-white/50">Reference: {payment.reference}</p> : null}
        </div>
        <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-white">{money(payment.amountPence)}</span>
      </div>;
    })}</div>
  </details>;
}

export function PlayerCollectionReconciliation({ rows, chargePence, outstandingPence }: {
  rows: PlayerCollectionFigure[]; chargePence: number; outstandingPence: number;
}) {
  const f = getPlayerCollectionFigures(rows, chargePence);
  if (!f.captainReportedPence && !f.playerOutstandingPence && !f.excessPence) return null;
  return <section className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/10 p-4 text-sm leading-6" data-player-collection-reconciliation aria-label="Player collection explanation">
    {f.captainReportedPence > 0 ? <div>
      <p data-captain-reported-pence={f.captainReportedPence} className="font-semibold text-white">Recorded paid to captain: <span className="whitespace-nowrap">{money(f.captainReportedPence)}</span></p>
      <p className="mt-1 text-white/65">This is not a receipt for SIXFL. Any money subsequently forwarded to SIXFL is counted in the team receipts, not again in these player rows.</p>
    </div> : null}
    {f.playerOutstandingPence > 0 ? <div>
      <p data-open-player-balance={f.playerOutstandingPence} className="text-white/85">Unpaid player balances: <strong className="whitespace-nowrap">{money(f.playerOutstandingPence)}</strong> — not an extra charge on top of the team's balance.</p>
      {!f.captainReportedPence && outstandingPence > f.playerOutstandingPence ? <p data-uncovered-after-player-balances={outstandingPence - f.playerOutstandingPence} className="mt-1 text-white/65">Of the <strong>{money(outstandingPence)}</strong> remaining, <strong>{money(f.playerOutstandingPence)}</strong> is owed by the listed players. Another <strong>{money(outstandingPence - f.playerOutstandingPence)}</strong> is not covered by those balances.</p> : null}
    </div> : null}
    {f.excessPence > 0 ? <div role="status" data-player-collection-excess={f.excessPence} className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-amber-100">
      <p className="font-semibold">Player split needs review</p>
      <p>{money(f.representedPence)} across the player records, against a {money(chargePence)} fixture: <strong>{money(f.excessPence)} difference.</strong></p>
      <p className="mt-1">This does not increase the fixture fee. Check the agreed shares before collecting more.</p>
    </div> : null}
  </section>;
}

export function TeamBalanceReconciliation({ entries, outstandingPence }: {
  entries: Array<{ chargeId: string; fixtureLabel: string; dueDate: Date | null; amountPence: number; outstandingPence: number }>;
  outstandingPence: number;
}) {
  if (!entries.length) return null;
  return <section data-team-balance-reconciliation className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
    <h2 className="text-base font-semibold text-white">How your balance due is made up</h2>
    <div className="mt-2 divide-y divide-white/10">{entries.map(entry => <div key={entry.chargeId} data-due-charge={entry.chargeId} data-due-pence={entry.outstandingPence} className="flex items-start justify-between gap-4 py-3 text-sm">
      <div className="min-w-0"><p className="font-medium text-white/90">{entry.fixtureLabel}</p><p className="mt-1 text-xs text-white/60">{entry.dueDate ? `${date(entry.dueDate)} · ` : ""}{money(entry.amountPence)} charge</p></div>
      <strong className="shrink-0 whitespace-nowrap tabular-nums text-amber-100">{money(entry.outstandingPence)}</strong>
    </div>)}</div>
    <div className="flex justify-between gap-4 border-t border-white/15 pt-4 text-base font-semibold text-white"><span>Total due to SIXFL</span><span className="shrink-0 whitespace-nowrap tabular-nums" data-reconciled-team-balance={outstandingPence}>{money(outstandingPence)}</span></div>
    <p className="mt-2 text-xs leading-5 text-white/60">One balance per due charge. Player requests and receipt history are not added again.</p>
  </section>;
}
