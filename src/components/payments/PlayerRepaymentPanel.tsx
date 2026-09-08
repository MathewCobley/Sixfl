import Link from "next/link";
import { getPlayerRepaymentTarget } from "@/lib/payments/player-repayment-checkout";
import { money } from "@/lib/payments/player-ledger";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export default async function PlayerRepaymentPanel({planToken,feeToken,message}:{planToken?:string;feeToken?:string;message?:string}){
  const t=await getPlayerRepaymentTarget({planToken,feeToken});
  return <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white"><div className="mx-auto max-w-2xl space-y-5">
    <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">SIXFL · {t.account.teamName}</p>
    <h1 className="text-3xl font-semibold">{t.plan?"Your agreed payment":"Your player balance"}</h1>
    <p className="text-white/65">{t.account.playerName}</p>
    {message?<p role="status" className="rounded-xl border border-amber-300/30 p-4">{message}</p>:null}
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
      <div className="flex justify-between gap-4"><span>{t.plan?"Balance in this arrangement":"Balance for this charge"}</span><strong>{money(t.balancePence)}</strong></div>
      <div className="flex justify-between gap-4"><span>{t.plan?"Agreed instalment":"Payment requested"}</span><strong>{money(t.amountPence)}</strong></div>
      <div className="flex justify-between gap-4 text-sm text-white/65"><span>Remaining after payment is received</span><strong>{money(Math.max(t.balancePence-t.amountPence,0))}</strong></div>
      {t.plan?<p className="text-sm text-white/65">Due {formatDateTimeInLondon(t.plan.nextDueAt,{day:"numeric",month:"long",year:"numeric"})}. New match fees are separate from this arrangement. This is not an automatic card charge.</p>:null}
      {t.hold?<p role="status" className="rounded-xl border border-amber-300/20 p-4 text-amber-100">{t.hold}</p>:<form method="post" action={`${t.path}/start`}><button className="w-full rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black" type="submit">Pay {money(t.amountPence)}</button></form>}
      <p className="text-xs text-white/50">Creating, replacing or cancelling a checkout does not reduce your debt. Your balance changes only after a confirmed payment or an explicitly recorded adjustment.</p>
    </section>
    <p className="text-sm text-white/65">Total recorded player balance with {t.account.teamName}: <strong>{money(t.account.balancePence)}</strong>.</p>
    <Link className="inline-block text-emerald-200 underline" href={`/player/team/${t.account.teamId}/ledger`}>View payment history (sign in)</Link>
  </div></main>;
}
