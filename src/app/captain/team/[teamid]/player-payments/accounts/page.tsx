import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { money, visiblePlayerLedgerStateSql } from "@/lib/payments/player-ledger";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{teamid:string}>}){
  const {teamid}=await params;await requireCaptain(teamid);
  const rows=await prisma.$queryRaw<Array<{feeId:string;playerName:string|null;balancePence:number;owner:string}>>(Prisma.sql`
    SELECT s."feeId",s."playerName",s."balancePence",COALESCE('user:'||s."userId",'user:'||(
      SELECT CASE WHEN COUNT(DISTINCT m."userId")=1 THEN MIN(m."userId") ELSE NULL END FROM "TeamMemberProfile" p JOIN "TeamMember" m ON m.id=p."teamMemberId"
      WHERE p."sourceProspectId"=s."prospectId" AND m."teamId"=s."teamId"),
      'member:'||s."teamMemberId",'prospect:'||s."prospectId",'fee:'||s."feeId") AS owner
    FROM "PlayerFeeLedgerState" s WHERE s."teamId"=${teamid} AND ${visiblePlayerLedgerStateSql()} ORDER BY s."createdAt"`);
  const accounts=new Map<string,{feeId:string;name:string;balance:number}>();
  for(const r of rows){const a=accounts.get(r.owner)??{feeId:r.feeId,name:r.playerName||"Historical player",balance:0};a.balance+=r.balancePence;accounts.set(r.owner,a);}
  const list=[...accounts.values()].sort((a,b)=>b.balance-a.balance||a.name.localeCompare(b.name));
  return <main className="mx-auto max-w-4xl space-y-5 p-5 text-white"><Link className="text-emerald-200 underline" href={`/captain/team/${teamid}/player-payments`}>Back to Squad payments</Link>
    <h1 className="text-3xl font-semibold">Player balances and history</h1><p className="text-white/60">Balances include older unpaid charges, even where collection links are paused. Normal payments need no extra steps; smaller payments are optional inside a player account.</p>
    <div className="space-y-3">{list.map(a=><Link key={a.feeId} href={`/captain/team/${teamid}/player-payments/account/${a.feeId}`} className="flex justify-between gap-4 rounded-xl border border-white/10 p-4"><span>{a.name}</span><strong>{money(a.balance)}{a.balance===0?" · settled":" outstanding"}</strong></Link>)}</div>
  </main>;
}
