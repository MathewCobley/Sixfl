import Link from "next/link";
import type { PaymentWarningHistoryItem } from "@/lib/payments/player-payment-warning-history";

const tones = {
  pending: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  sent: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  problem: "border-red-400/30 bg-red-500/10 text-red-100",
  neutral: "border-white/10 bg-white/5 text-white/60",
};
export default function PlayerPaymentWarningStatus({ warning, feeId, showHistoryLink = false }: {
  warning?: PaymentWarningHistoryItem | null;
  feeId: string;
  showHistoryLink?: boolean;
}) {
  if (!warning) return <p className="mt-2 text-xs text-white/50">Payment warning: none requested</p>;
  return <div data-payment-warning-fee-id={feeId} className="mt-3 min-w-0 space-y-1 text-xs">
    <span className={`inline-flex max-w-full flex-wrap gap-x-2 rounded-xl border px-3 py-1.5 font-semibold ${tones[warning.tone]}`}>
      <span>{warning.label} · {warning.channel}</span><span>{warning.timestamp}</span>
    </span>
    {warning.deadline ? <p className="text-white/75">Payment deadline: {warning.deadline}</p> : null}
    {warning.detail ? <p className="max-w-xl break-words text-white/60">{warning.detail}</p> : null}
    {warning.failureReason ? <p className="max-w-xl break-words text-amber-100">{warning.failureReason}</p> : null}
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
      {showHistoryLink ? <Link href={`/admin/payments/player-warning?feeId=${encodeURIComponent(feeId)}#warning-history`} className="text-emerald-200 underline">Warning history</Link> : null}
      <Link href={`/admin/queue/${encodeURIComponent(warning.id)}`} className="text-emerald-200 underline">View this warning in queue</Link>
    </div>
  </div>;
}
