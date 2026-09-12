import {prisma} from '@/lib/prisma';
import {previewFixtureVeoNight} from '@/lib/veo/fixture-bookings';
import {FinaliseChoicesForm,RecordingOutcomeForm} from './FixtureDecisionForms';
const time=(d:Date)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(d);
export default async function FixtureVeoNightPanel({leagueId,date}:{leagueId:string;date:string}) {
 let preview:Awaited<ReturnType<typeof previewFixtureVeoNight>>|null=null,error='';
 try{preview=await previewFixtureVeoNight(leagueId,date);}catch(e){error=e instanceof Error?e.message:'Unable to load camera schedule.';}
 const bookings=await prisma.$queryRaw<{fixtureId:string;leagueId:string;homeName:string;awayName:string;kickoffAt:Date;pitch:string;state:string;status:string;url:string|null;paying:number}[]>`
 SELECT b."fixtureId",b."leagueId",h.name AS "homeName",a.name AS "awayName",b."kickoffAt",b.pitch,b.state,f.status::text,f."sixflTvUrl" AS url,
 (SELECT COUNT(*)::integer FROM "VeoFixtureRequest" r WHERE r."fixtureId"=b."fixtureId" AND r."agreedPence"=500) AS paying
 FROM "VeoMatchBooking" b JOIN "Fixture" f ON f.id=b."fixtureId" JOIN "Team" h ON h.id=b."homeTeamId" JOIN "Team" a ON a.id=b."awayTeamId"
 WHERE (b."leagueId"=${leagueId} OR b."cameraKey"=${preview?.cameraKey??''})
 AND to_char(b."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London','YYYY-MM-DD')=${date} ORDER BY b."kickoffAt",b."fixtureId"`;
 return <section aria-label="Fixture Veo requests" className="space-y-5 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/5 p-5 sm:p-6">
  <h2 className="text-xl font-bold">Fixture requests and filming decisions</h2>
  <p className="text-sm leading-6 text-white/70">Captains choose one match or a remembered preference when confirming attendance. Both options have equal priority. Review the full camera evening below, then confirm bookings. This does not change any original match payment or take money.</p>
  <form method="get" className="flex flex-wrap items-end gap-3"><label className="block text-sm">Match date (UK)<input type="date" name="date" required defaultValue={date} className="mt-2 block min-h-11 rounded-xl border border-white/20 bg-black/20 p-3"/></label><button className="min-h-11 rounded-xl border border-white/20 p-3">Show requests</button></form>
  {error&&<p role="alert" className="text-sm text-amber-100">{error}</p>}
  {preview&&!preview.settings.enabled&&<p className="text-sm text-white/65">Veo is off. Existing accepted bookings remain visible; no new request is accepted.</p>}
  {preview?.cameraKey&&<>
   <p className="text-sm text-fuchsia-100">One camera · maximum {preview.settings.maxMatches} filmed matches across all leagues sharing this pitch this evening · {preview.choices.length} new bookings proposed.</p>
   <div className="space-y-3">{preview.fixtures.filter(f=>f.requestRows.length>0&&!f.bookingState).map(f=>{
     const chosen=preview!.choices.find(c=>c.fixtureId===f.id);
     return <div key={f.id} className="space-y-2 rounded-xl border border-white/15 p-4"><h3 className="font-semibold">{time(f.kickoffAt)} · {f.homeName} vs {f.awayName}</h3><p className="text-sm text-white/70">{chosen?`Proposed Veo pitch: ${chosen.pitch}${chosen.swapWithId?' — pitch swap only':''}`:f.locked?'Existing arrangement is protected; no new booking.':'No camera slot proposed. No new Veo charge.'}</p>{f.requestRows.map(r=><p key={r.teamId} className="text-sm text-white/65">{r.teamId===f.homeTeamId?f.homeName:f.awayName}: {r.status==='REQUESTED'?r.choice==='ONGOING'?'Requested · remembered preference':'Requested · this match only':r.status==='NONE'?'No Priority requested':r.status==='UNAVAILABLE'?'No space available':r.status}</p>)}</div>;
   })}</div>
   <FinaliseChoicesForm leagueId={leagueId} date={date} fingerprint={preview.fingerprint} count={preview.choices.length}/>
  </>}
  <div className="space-y-3"><h3 className="font-semibold">Accepted bookings and recordings</h3>{bookings.map(b=><div key={b.fixtureId} className="space-y-3 rounded-xl border border-white/15 p-4"><h4 className="font-semibold">{time(b.kickoffAt)} · {b.homeName} vs {b.awayName}</h4><p className="text-sm text-white/70">Pitch {b.pitch} · {b.state==='PLANNED'?'Filming confirmed — not billed yet':b.state==='READY'?'Recording ready — Veo charges added':'Closed — no Veo charge due'} · {b.paying} accepted £5 request{b.paying===1?'':'s'}</p>{b.url&&<a href={b.url} target="_blank" rel="noopener noreferrer" className="text-sm text-fuchsia-100 underline">Watch recording</a>}{['PLANNED','READY'].includes(b.state)&&<RecordingOutcomeForm leagueId={b.leagueId} fixtureId={b.fixtureId} ready={b.state==='READY'} completed={b.status==='COMPLETED'}/>}</div>)}{!bookings.length&&<p className="text-sm text-white/60">No accepted filming bookings on this date.</p>}</div>
  <p className="text-xs leading-5 text-white/55">After a completed match, confirm the usable recording to create each agreed £5 as a separate Team payments line. Failed recordings are not billed. If a billed recording proves unusable, closing it voids the Veo charge and credits only money actually received. One-off requests and remembered preferences never stack two charges.</p>
 </section>;
}
