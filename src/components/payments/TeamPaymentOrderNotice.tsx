import Link from "next/link";
import { formatPaymentFixtureDate, formatPaymentMoney } from "@/lib/payments/team-payment-ledger";
import { paymentOrderDate, paymentOrderMessage, type PaymentOrderDecision } from "@/lib/payments/team-payment-order-policy";

export function TeamPaymentOrderNotice({ decision }: { decision: PaymentOrderDecision }) {
  if (decision.allowed || decision.code === "SETTLED") return null;
  return (
    <div role="status" className="max-w-xl rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
      <p className="font-semibold">{paymentOrderMessage(decision)}</p>
      {decision.blocker ? <p className="mt-1">Due {formatPaymentFixtureDate(paymentOrderDate(decision.blocker))}</p> : null}
      {decision.blocker?.paymentToken ? (
        <Link href={`/pay/charge/${encodeURIComponent(decision.blocker.paymentToken)}`} className="mt-3 inline-flex rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-black">
          Pay outstanding {formatPaymentMoney(decision.blocker.outstandingPence)}
        </Link>
      ) : null}
      <p className="mt-2 text-xs text-white/60">Squad payments and player money forwarded by the captain stay with their original fixture.</p>
    </div>
  );
}
