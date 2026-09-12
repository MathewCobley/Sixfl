import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireCaptain } from '@/lib/requireCaptain';
const money=(n:number)=>`£${(n/100).toFixed(2)}`;
export default async function CaptainVeoBookings({teamId}:{teamId:string}){
 await requireCaptain(teamId);
 const rows=await prisma.$queryRaw<{fixtureId:string;kickoffAt:Date;allocated:boolean;failedAt:Date|null;pitch:string|null;opponent:string;base:number;extra:number;url:string|null}[]>`
  SELECT d."fixtureId",d."kickoffAt",d.allocated,d."failedAt",d.pitch,f."sixflTvUrl" AS url,
    CASE WHEN d."homeTeamId"=${teamId} THEN a.name ELSE h.name END AS opponent,
    CASE WHEN d."homeTeamId"=${teamId} THEN d."homeBasePence" ELSE d."awayBasePence" END AS base,
    CASE WHEN d."homeTeamId"=${teamId} THEN d."homeExtraPence" ELSE d."awayExtraPence" END AS extra
  FROM "VeoMatchDecision" d JOIN "Fixture" f ON f.id=d."fixtureId" JOIN "Team" h ON h.id=d."homeTeamId" JOIN "Team" a ON a.id=d."awayTeamId"
  WHERE (d."homeTeamId"=${teamId} OR d."awayTeamId"=${teamId}) AND d."kickoffAt">=(NOW() AT TIME ZONE 'UTC')-INTERVAL '14 days'
  ORDER BY d."kickoffAt" DESC LIMIT 12`;
 if(!rows.length)return null;
 return <section aria-label="Your Veo bookings" className="space-y-4 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/5 p-5 text-white"><h2 className="text-lg font-semibold">Your Veo bookings</h2>{rows.map(r=><div key={r.fixtureId} className="space-y-2 rounded-xl border border-white/15 p-4"><h3 className="font-semibold">vs {r.opponent} · {new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}).format(r.kickoffAt)}</h3><p className="text-sm">{r.failedAt?'Recording unavailable. Any Veo add-on is cancelled; payments received are returned as team credit.':r.allocated?'📹 Camera pitch confirmed':'No camera place this time — no Veo charge.'}</p><p className="text-sm">Original match fee {money(r.base)}{r.extra>0&&!r.failedAt?` + separate Veo add-on ${money(r.extra)} = ${money(r.base+r.extra)}`:''}.</p>{r.url&&!r.failedAt&&<a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-fuchsia-100 underline">Watch your match</a>}</div>)}<Link href={`/captain/team/${teamId}/payments`} className="inline-flex min-h-11 items-center text-fuchsia-100 underline">View team payments and credit</Link><p className="text-xs text-white/60">Original match charges are unchanged. Team payments shows the current balance and any later adjustments.</p></section>;
}
