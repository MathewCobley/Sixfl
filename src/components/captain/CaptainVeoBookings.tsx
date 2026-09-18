import Link from 'next/link';
import {prisma} from '@/lib/prisma';
export default async function CaptainVeoBookings({teamId}:{teamId:string}) {
 const rows=await prisma.$queryRaw<{fixtureId:string;kickoffAt:Date;opponent:string;state:string;agreedPence:number|null;chargeId:string|null;url:string|null}[]>`
 SELECT b."fixtureId",b."kickoffAt",b.state,r."agreedPence",r."chargeId",f."sixflTvUrl" AS url,o.name AS opponent
 FROM "VeoMatchBooking" b JOIN "Fixture" f ON f.id=b."fixtureId"
 JOIN "Team" o ON o.id=CASE WHEN b."homeTeamId"=${teamId} THEN b."awayTeamId" ELSE b."homeTeamId" END
 LEFT JOIN "VeoFixtureRequest" r ON r."fixtureId"=b."fixtureId" AND r."teamId"=${teamId}
 WHERE (b."homeTeamId"=${teamId} OR b."awayTeamId"=${teamId}) AND b."kickoffAt">(NOW() AT TIME ZONE 'UTC')-INTERVAL '14 days'
 ORDER BY b."kickoffAt" DESC LIMIT 12`;
 if(!rows.length)return null;
 return <section aria-label="Your Veo bookings" className="space-y-4 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/5 p-5 text-white"><h2 className="text-lg font-bold">Your Veo bookings and recordings</h2>{rows.map(r=><div key={r.fixtureId} className="space-y-2 rounded-xl border border-white/10 p-4"><strong>vs {r.opponent}</strong><p className="text-xs text-white/65">{new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}).format(r.kickoffAt)}</p><p className="text-sm leading-6">{r.state==='PLANNED'?'Filming confirmed. New SIXFL TV Priority bookings are free.':r.state==='READY'?`Recording ready.${r.chargeId?' An older Veo charge remains in Team payments from the previous Priority system.':' No filming charge is due.'}`:'Filming unavailable.'}</p>{r.state==='READY'&&r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-fuchsia-100 underline">Watch your match</a>}{r.chargeId&&r.state==='READY'&&<Link href={`/captain/team/${teamId}/payments`} className="ml-4 text-sm text-emerald-100 underline">View Team payments</Link>}</div>)}</section>;
}
