import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPlayerLedgerAccount, getPlayerLedgerSummaryForUser, money, repaymentAmount } from "@/lib/payments/player-ledger";
import PlayerLedgerStatement from "@/components/payments/PlayerLedgerStatement";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{teamid:string}>}){
  const {teamid}=await params;const session=await getServerSession(authOptions);
  if(!session?.user?.email)redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/ledger`)}`);
  const user=await prisma.user.findUnique({where:{email:session.user.email.trim().toLowerCase()},select:{id:true}});if(!user)notFound();
  const summary=await getPlayerLedgerSummaryForUser(teamid,user.id);
  if(!summary.anchorFeeId)return <main className="p-6 text-white"><h1>Your payment history</h1><p>No recorded player charges for this team.</p><Link href={`/player/team/${teamid}`}>Back to your team</Link></main>;
  const account=await getPlayerLedgerAccount(teamid,summary.anchorFeeId);
  return <main className="mx-auto max-w-5xl space-y-5 p-5 text-white"><Link className="text-emerald-200 underline" href={`/player/team/${teamid}`}>Back to your team</Link>
    <h1 className="text-3xl font-semibold">Your payment history</h1><p>{account.teamName} · Total outstanding: <strong>{money(account.balancePence)}</strong></p>
    {account.plans.filter(p=>["ACTIVE","PAUSED","REVIEW"].includes(p.status)).map(p=>{const balance=account.states.filter(s=>s.planId===p.id).reduce((sum,s)=>sum+s.balancePence,0);return <section key={p.id} className="rounded-xl border border-amber-300/25 p-4"><h2 className="font-semibold">Agreed smaller payments</h2><p>Balance in arrangement: {money(balance)}. Next instalment: {money(repaymentAmount(p,balance))}, due {formatDateTimeInLondon(p.nextDueAt,{day:"numeric",month:"long",year:"numeric"})}.</p><p className="mt-1 text-sm text-white/60">New match fees are separate. Status: {p.status.toLowerCase()}.</p><Link href={`/pay/player-repayment/${p.token}`} className="mt-3 inline-block rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-black">Open agreed payment</Link></section>;})}
    <PlayerLedgerStatement account={account}/>
  </main>;
}
