import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPlayerPaymentWarningHistory } from "@/lib/payments/player-payment-warning-history";
import PlayerPaymentWarningStatus from "@/components/admin/payments/PlayerPaymentWarningStatus";
import RefreshPaymentWarningStatus from "@/components/admin/payments/RefreshPaymentWarningStatus";
import { toLondonDateInputValue, toLondonTimeInputValue } from "@/lib/datetime/london";
import { loadPlayerPaymentWarningTarget } from "@/lib/payments/player-payment-warning";
import { PaymentWarningError } from "@/lib/payments/player-payment-warning-policy";
import PlayerPaymentWarningForm from "@/components/admin/payments/PlayerPaymentWarningForm";
export const dynamic = "force-dynamic";
export const metadata = { title: "Individual payment warning | SIXFL" };
export default async function PlayerPaymentWarningPage({ searchParams }: { searchParams: Promise<{ feeId?: string }> }) {
  await requireAdmin();
  const { feeId } = await searchParams;
  if (typeof feeId !== "string" || !feeId.trim()) return <p className="p-6 text-white">Select an individual fee from <Link className="underline" href="/admin/payments?view=playerFees">Open player fees due</Link>.</p>;
  let target = null, blocked = null;
  try { target = await loadPlayerPaymentWarningTarget(feeId); }
  catch (error) { if (!(error instanceof PaymentWarningError)) throw error; blocked = error.message; }
  const history = await getPlayerPaymentWarningHistory(feeId);
  const defaultDate = new Date(Date.now() + 48 * 3600000);
  return <main className="mx-auto max-w-4xl space-y-6 px-6 pb-10">
    <Link href="/admin/payments?view=playerFees" className="text-emerald-200 underline">← Back to player fees</Link>
    <h1 className="text-3xl font-semibold text-white">Send payment warning</h1>
    <p className="text-white/65">Preview first, then confirm. This contacts one player about one existing unpaid fee, not the team or squad.</p>
    {blocked ? <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100">{blocked}</p> : null}
    {target ? <><section className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white"><h2 className="text-xl font-semibold">{target.playerName} · {target.amount}</h2><p className="mt-2 text-white/70">{target.fee.team.name} · {target.fixtureLabel}</p></section>
      <PlayerPaymentWarningForm feeId={feeId} email={target.email} phone={target.phone} emailAllowed={target.allowed.EMAIL} smsAllowed={target.allowed.SMS} defaultDeadline={`${toLondonDateInputValue(defaultDate)}T${toLondonTimeInputValue(defaultDate)}`} /></> : null}
    <section id="warning-history" className="scroll-mt-6 space-y-3 rounded-2xl border border-white/10 p-5 text-white"><h2 className="text-xl font-semibold">Warning history for this fee</h2><p className="text-sm text-white/60">One pending warning at a time; at least 24 hours between sent warnings. Existing ordinary chase controls are unchanged.</p>
      <RefreshPaymentWarningStatus />
      {history.length ? history.map(item => <div key={item.id} className="rounded-xl bg-white/5 p-3"><PlayerPaymentWarningStatus feeId={feeId} warning={item} /></div>) : <p className="text-sm text-white/60">No individual payment warnings requested for this fee.</p>}
    </section>
  </main>;
}
