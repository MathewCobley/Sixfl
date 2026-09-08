import Link from "next/link";
import { requireCaptain } from "@/lib/requireCaptain";
import { prisma } from "@/lib/prisma";
import { basicRepaymentFee, getPlayerLedgerAccount, money, newLedgerActionKey, repaymentAmount } from "@/lib/payments/player-ledger";
import { formatDateTimeInLondon, toLondonDateInputValue } from "@/lib/datetime/london";
import PlayerLedgerStatement from "@/components/payments/PlayerLedgerStatement";
import { savePlayerAccountAction } from "./actions";
export const dynamic="force-dynamic";
const input="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white";
const button="rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-black";
const date=(d:Date)=>formatDateTimeInLondon(d,{day:"numeric",month:"short",year:"numeric"});

export default async function PlayerAccountPage({params,searchParams}:{params:Promise<{teamid:string;feeId:string}>;searchParams:Promise<{saved?:string;error?:string}>}){
  const {teamid,feeId}=await params;await requireCaptain(teamid);const sp=await searchParams;
  const account=await getPlayerLedgerAccount(teamid,feeId);
  const activePlanIds=new Set(account.plans.filter(p=>["ACTIVE","PAUSED","REVIEW"].includes(p.status)).map(p=>p.id));
  const selectable=account.fees.filter(f=>basicRepaymentFee(f)&&!activePlanIds.has(account.states.find(s=>s.feeId===f.id)?.planId??""));
  const requests=await prisma.playerRepaymentRequest.findMany({where:{teamId:teamid,OR:[{feeId:{in:account.states.map(s=>s.feeId)}},{planId:{in:account.plans.map(p=>p.id)}}]},orderBy:{createdAt:"desc"},take:30});
  const hidden=<><input type="hidden" name="teamId" value={teamid}/><input type="hidden" name="anchorFeeId" value={feeId}/></>;
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 text-white">
    <Link href={`/captain/team/${teamid}/player-payments`} className="text-emerald-200 underline">Back to Squad payments</Link>
    <header><p className="text-sm uppercase tracking-wide text-white/50">{account.teamName} · Player account</p><h1 className="mt-2 text-3xl font-semibold">{account.playerName}</h1>
      <p className="mt-3 text-xl">Total outstanding: <strong>{money(account.balancePence)}</strong></p>
      <p className="mt-2 text-sm text-white/60">Normal match payments still work as before. The balance is recorded separately from payment links. This account belongs to this team only.</p></header>
    {sp.saved?<p role="status" className="rounded-xl border border-emerald-400/25 p-4">Player account updated. No money is marked received merely by creating an arrangement.</p>:null}
    {sp.error?<p role="alert" className="rounded-xl border border-red-300/30 p-4 text-red-100">{sp.error}</p>:null}
    {account.plans.filter(p=>["ACTIVE","PAUSED","REVIEW"].includes(p.status)).map(p=>{const balance=account.states.filter(s=>s.planId===p.id).reduce((sum,s)=>sum+s.balancePence,0);const due=repaymentAmount(p,balance);return <section key={p.id} className="space-y-3 rounded-2xl border border-amber-300/25 bg-amber-400/5 p-5">
      <h2 className="text-lg font-semibold">Agreed smaller payments · {p.status.toLowerCase()}</h2><p>Balance in arrangement: <strong>{money(balance)}</strong> · Next payment: <strong>{money(due)}</strong> · Due {date(p.nextDueAt)}</p>
      <p className="text-sm text-white/60">{p.reason} New match charges are not automatically added. Cancelling this arrangement does not forgive the balance.</p>
      <Link className="inline-block text-emerald-200 underline" href={`/pay/player-repayment/${p.token}`} target="_blank">Open player’s instalment link</Link>
      <form action={savePlayerAccountAction} className="flex flex-wrap gap-3">{hidden}<input type="hidden" name="planId" value={p.id}/>
        <button className={button} name="action" value={p.status==="ACTIVE"?"pause":"resume"}>{p.status==="ACTIVE"?"Pause arrangement":"Resume arrangement"}</button>
        <button className="rounded-xl border border-white/20 px-4 py-2" name="action" value="end">End arrangement — keep debt</button></form>
    </section>;})}
    <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><summary className="cursor-pointer font-semibold">Arrange smaller payments</summary>
      <p className="mt-3 text-sm text-white/65">Choose the existing charges to repay. Entering £8 here means “collect £8”, not “reduce the debt to £8”. Payments cover the selected charges oldest first. New weekly match fees continue normally and remain separate.</p>
      {selectable.length?<form action={savePlayerAccountAction} className="mt-4 space-y-4">{hidden}<input type="hidden" name="action" value="create-plan"/>
        <fieldset className="space-y-2"><legend className="mb-2 font-medium">Charges to include</legend>{selectable.map(f=><label key={f.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-3"><input type="checkbox" name="feeId" value={f.id} defaultChecked/><span>{date(f.fixture.kickoffAt)} · {f.fixture.homeTeam.name} vs {f.fixture.awayTeam.name} · {money(account.states.find(s=>s.feeId===f.id)!.balancePence)}</span></label>)}</fieldset>
        <div className="grid gap-4 sm:grid-cols-2"><label>Weekly payment (£)<input className={input} name="instalment" inputMode="decimal" placeholder="8.00" required/></label>
        <label>First payment date (UK)<input className={input} name="firstDueDate" type="date" defaultValue={toLondonDateInputValue(new Date())}/></label></div>
        <label className="block">Agreement / reason<textarea className={input} name="reason" maxLength={1000} placeholder="Agreed with the player: £8 each week towards these outstanding charges." required/></label>
        <p className="text-xs text-white/55">The player receives one email when each instalment becomes due. Old individual chases are held. This does not authorise automatic card debits.</p>
        <button className={button}>Save repayment arrangement</button></form>:<p className="mt-4 text-white/60">No ordinary unpaid charges are available for a new arrangement. Existing special concessions, credits and cancelled fixtures keep their existing controls and may need SIXFL review.</p>}
    </details>
    <section className="rounded-2xl border border-white/10 p-5"><h2 className="text-lg font-semibold">Recorded charges</h2><div className="mt-3 space-y-4">
      {account.states.map(s=>{const f=account.fees.find(f=>f.id===s.feeId);return <div key={s.feeId} className="rounded-xl border border-white/10 p-4"><p className="font-medium">{f?`${date(f.fixture.kickoffAt)} · ${f.fixture.homeTeam.name} vs ${f.fixture.awayTeam.name}`:"Historical charge"}</p>
      <p className="mt-1 text-sm">Outstanding: <strong>{money(s.balancePence)}</strong>{s.collectionPaused?" · Collection paused — debt retained":""}{s.controlled?" · Ledger-managed":""}</p>
      {s.controlled?<p className="text-xs text-white/55">Received through this arrangement: {money(s.receivedPence)} by SIXFL; {money(s.captainReceivedPence)} by the captain. These are not added to the team charge twice.</p>:null}
      {s.collectionPaused&&s.balancePence>0?<form action={savePlayerAccountAction} className="mt-2">{hidden}<input type="hidden" name="feeId" value={s.feeId}/><button className={button} name="action" value="resume-fee">Resume collection link</button></form>:null}
      {s.balancePence>0?<details className="mt-3"><summary className="cursor-pointer text-sm text-emerald-200">Record money received or a genuine reduction</summary><form action={savePlayerAccountAction} className="mt-3 space-y-3">{hidden}<input type="hidden" name="feeId" value={s.feeId}/><input type="hidden" name="requestKey" value={newLedgerActionKey()}/>
        <select className={input} name="action"><option value="captain-receipt">Captain actually received this money</option><option value="reduce">Forgive / reduce this part of the debt (no payment)</option></select>
        <label className="block">Amount (£)<input className={input} name="amount" inputMode="decimal" required/></label><label className="block">Receipt reference or reason<input className={input} name="reason" maxLength={1000} required/></label>
        <p className="text-xs text-white/55">Only record money the captain has actually received. This is not a SIXFL bank receipt and does not reduce the team’s fixture charge. A reduction forgives player debt; it does not change the team fee.</p><button className={button}>Record account entry</button>
      </form></details>:null}</div>;})}
    </div></section>
    {requests.length?<details className="rounded-2xl border border-white/10 p-5"><summary className="cursor-pointer font-semibold">Checkout history</summary><div className="mt-3 space-y-3">{requests.map(r=><div key={r.id} className="rounded-xl border border-white/10 p-3"><p>{date(r.createdAt)} · {money(r.amountPence)} · {r.status}{r.refundedPence?` · Refunded ${money(r.refundedPence)}`:""}</p>{r.failureReason?<p className="text-sm text-amber-100">{r.failureReason}</p>:null}{["READY","CREATING"].includes(r.status)?<form action={savePlayerAccountAction} className="mt-2">{hidden}<input type="hidden" name="requestId" value={r.id}/><button className="text-sm text-emerald-200 underline" name="action" value="cancel-checkout">Cancel checkout — keep debt</button></form>:null}</div>)}</div></details>:null}
    <PlayerLedgerStatement account={account}/>
  </main>;
}
