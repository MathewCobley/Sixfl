import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { formatDateTimeInLondon, toLondonDateInputValue, toLondonTimeInputValue } from "@/lib/datetime/london";
import { loadPlayerPaymentWarningTarget } from "@/lib/payments/player-payment-warning";
import { PaymentWarningError, PLAYER_PAYMENT_WARNING_SOURCE } from "@/lib/payments/player-payment-warning-policy";
import PlayerPaymentWarningForm from "@/components/admin/payments/PlayerPaymentWarningForm";
export const dynamic = "force-dynamic";
export const metadata = { title: "Individual payment warning | SIXFL" };
const format = (date: Date) => formatDateTimeInLondon(date, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
export default async function PlayerPaymentWarningPage({ searchParams }: { searchParams: Promise<{ feeId?: string }> }) {
  await requireAdmin();
  const { feeId } = await searchParams;
  if (typeof feeId !== "string" || !feeId.trim()) return <p className="p-6 text-white">Select an individual fee from <Link className="underline" href="/admin/payments?view=playerFees">Open player fees due</Link>.</p>;
  let target = null, blocked = null;
  try { target = await loadPlayerPaymentWarningTarget(feeId); }
  catch (error) { if (!(error instanceof PaymentWarningError)) throw error; blocked = error.message; }
  const history = await prisma.notificationDispatch.findMany({ where: { sourceType: PLAYER_PAYMENT_WARNING_SOURCE, sourceId: feeId }, orderBy: { createdAt: "desc" }, take: 10,
    select: { id: true, status: true, channel: true, createdAt: true, scheduledFor: true, sentAt: true, failureReason: true } });
  const defaultDate = new Date(Date.now() + 48 * 3600000);
  return <main className="mx-auto max-w-4xl space-y-6 px-6 pb-10">
    <Link href="/admin/payments?view=playerFees" className="text-emerald-200 underline">← Back to player fees</Link>
    <h1 className="text-3xl font-semibold text-white">Send payment warning</h1>
    <p className="text-white/65">Preview first, then confirm. This contacts one player about one existing unpaid fee, not the team or squad.</p>
    {blocked ? <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100">{blocked}</p> : null}
    {target ? <><section className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white"><h2 className="text-xl font-semibold">{target.playerName} · {target.amount}</h2><p className="mt-2 text-white/70">{target.fee.team.name} · {target.fixtureLabel}</p></section>
      <PlayerPaymentWarningForm feeId={feeId} email={target.email} phone={target.phone} emailAllowed={target.allowed.EMAIL} smsAllowed={target.allowed.SMS} defaultDeadline={`${toLondonDateInputValue(defaultDate)}T${toLondonTimeInputValue(defaultDate)}`} /></> : null}
    <section className="space-y-3 rounded-2xl border border-white/10 p-5 text-white"><h2 className="text-xl font-semibold">Warning history for this fee</h2><p className="text-sm text-white/60">One pending warning at a time; at least 24 hours between sent warnings. Existing ordinary chase controls are unchanged.</p>
      {history.length ? history.map(item => <div key={item.id} className="rounded-xl bg-white/5 p-3 text-sm"><strong>{item.channel} · {item.status.toLowerCase()}</strong><p>{item.sentAt ? `Sent: ${format(item.sentAt)}` : item.status === "QUEUED" ? `Queued, not yet sent. Scheduled: ${format(item.scheduledFor)}` : `Requested: ${format(item.createdAt)}`}</p>{item.failureReason ? <p className="mt-1 text-amber-200">{item.failureReason}</p> : null}</div>) : <p className="text-sm text-white/60">No individual payment warnings requested for this fee.</p>}
    </section>
  </main>;
}
