import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getPaymentReceiptKind, getPaymentReceiptLabel, getPaymentReceiptPlayerFeeId, getPlayerCollectionFigures,
  type PaymentReceipt, type PlayerCollectionFigure } from "@/lib/payments/payment-receipt-presentation";

const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const date = (value: Date) => formatDateTimeInLondon(value, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function PaymentReceiptDetails({ payments, playerNames, title, isKitCharge = false }: {
  payments: PaymentReceipt[];
  playerNames: Map<string, { payerName: string }>;
  title: string;
  isKitCharge?: boolean;
}) {
  if (!payments.length) return null;
  return <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3" data-payment-receipt-details>
    <summary className="cursor-pointer text-xs font-semibold text-white/80">{title}</summary>
    <p className="mt-2 text-xs leading-5 text-white/60">These are the receipt records behind the totals above, not additional payments. Player receipts are already included in player payments received.</p>
    <div className="mt-3 space-y-3">{payments.map(payment => {
      const kind = getPaymentReceiptKind(payment);
      const feeId = getPaymentReceiptPlayerFeeId(payment.notes);
      const player = feeId ? playerNames.get(feeId) : null;
      return <div key={payment.id} data-receipt-kind={kind} data-receipt-amount={payment.amountPence} className="flex items-start justify-between gap-4 text-xs leading-5">
        <div className="min-w-0">
          <div className="font-semibold text-white">{getPaymentReceiptLabel(payment, isKitCharge)}{player ? ` — ${player.payerName}` : ""}</div>
          <div className="text-white/55">{payment.method.replaceAll("_", " ")} · {date(payment.paidAt)}</div>
          {kind === "PLAYER" ? <div className="text-emerald-100/70">Already included in the player total — not a second team payment.</div> : null}
          {payment.reference ? <div className="break-all text-[10px] text-white/45">Receipt reference: {payment.reference}</div> : null}
        </div>
        <span className="shrink-0 whitespace-nowrap font-semibold text-white">{money(payment.amountPence)}</span>
      </div>;
    })}</div>
  </details>;
}

export function PlayerCollectionReconciliation({ rows, chargePence, outstandingPence }: {
  rows: PlayerCollectionFigure[]; chargePence: number; outstandingPence: number;
}) {
  const figures = getPlayerCollectionFigures(rows, chargePence);
  if (!figures.captainReportedPence && !figures.playerOutstandingPence && !figures.excessPence) return null;
  return <div className="mt-3 space-y-2 rounded-xl border border-amber-300/20 bg-amber-500/5 p-3 text-xs leading-5" data-player-collection-reconciliation>
    <p className="font-semibold text-amber-100">Player collections are separate from money received by SIXFL</p>
    {figures.captainReportedPence > 0 ? <>
      <p data-captain-reported-pence={figures.captainReportedPence} className="text-white/80">Recorded paid to captain: <strong className="whitespace-nowrap">{money(figures.captainReportedPence)}</strong>.</p>
      <p className="text-white/65">Those players have paid the captain; this alone does not settle the team charge. Any money subsequently forwarded to SIXFL is counted through its actual receipt in the team totals, not a second time through these player rows.</p>
    </> : null}
    {figures.playerOutstandingPence > 0 ? <p data-open-player-balance={figures.playerOutstandingPence} className="text-white/80">Still owed by players: <strong className="whitespace-nowrap">{money(figures.playerOutstandingPence)}</strong>. This is not added on top of the <strong className="whitespace-nowrap">{money(outstandingPence)}</strong> outstanding to SIXFL.</p> : null}
    {!figures.captainReportedPence && figures.playerOutstandingPence > 0 && outstandingPence > figures.playerOutstandingPence ? <p data-uncovered-after-player-balances={outstandingPence - figures.playerOutstandingPence} className="text-white/80">Even after all these player balances are received, <strong className="whitespace-nowrap">{money(outstandingPence - figures.playerOutstandingPence)}</strong> would remain on the team charge.</p> : null}
    {figures.excessPence > 0 ? <div role="status" data-player-collection-excess={figures.excessPence} className="rounded-lg border border-amber-300/30 p-2 text-amber-100">
      Shown player contributions, captain-reported receipts and unpaid player balances total <strong className="whitespace-nowrap">{money(figures.representedPence)}</strong> against a <strong className="whitespace-nowrap">{money(chargePence)}</strong> charge — a <strong className="whitespace-nowrap">{money(figures.excessPence)}</strong> difference to review. This does not increase the fixture fee. Review the intended player split before collecting more; no debt or adjustment has been changed.
    </div> : null}
  </div>;
}

export function TeamBalanceReconciliation({ entries, outstandingPence }: {
  entries: Array<{ chargeId: string; fixtureLabel: string; dueDate: Date | null; amountPence: number; outstandingPence: number }>;
  outstandingPence: number;
}) {
  if (!entries.length) return null;
  return <section data-team-balance-reconciliation className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
    <h2 className="font-semibold text-white">How your balance due is made up</h2>
    <p className="mt-1 text-xs leading-5 text-white/60">One remaining balance per due charge. Player requests and copies of receipt records are not added again.</p>
    <div className="mt-3 divide-y divide-white/10">{entries.map(entry => <div key={entry.chargeId} data-due-charge={entry.chargeId} data-due-pence={entry.outstandingPence} className="flex items-start justify-between gap-4 py-3 text-sm">
      <div className="min-w-0"><p className="text-white/85">{entry.fixtureLabel}</p><p className="mt-1 text-xs text-white/55">{entry.dueDate ? `${date(entry.dueDate)} · ` : ""}{money(entry.amountPence)} charge; {money(entry.outstandingPence)} remaining.</p></div>
      <strong className="shrink-0 whitespace-nowrap text-amber-100">{money(entry.outstandingPence)}</strong>
    </div>)}</div>
    <div className="flex justify-between gap-4 border-t border-white/10 pt-3 font-semibold text-white"><span>Total due to SIXFL</span><span className="shrink-0 whitespace-nowrap" data-reconciled-team-balance={outstandingPence}>{money(outstandingPence)}</span></div>
  </section>;
}
