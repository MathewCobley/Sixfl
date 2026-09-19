import {prisma} from '@/lib/prisma';
import {previewFixtureVeoNight} from '@/lib/veo/fixture-bookings';
import {FinaliseChoicesForm,RecordingOutcomeForm} from './FixtureDecisionForms';
import VeoChoiceHistory from './VeoChoiceHistory';
const time=(d:Date)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(d);
export default async function FixtureVeoNightPanel({leagueId,date}:{leagueId:string;date:string}) {
 let preview:Awaited<ReturnType<typeof previewFixtureVeoNight>>|null=null,error='';
 try{preview=await previewFixtureVeoNight(leagueId,date);}catch(e){error=e instanceof Error?e.message:'Unable to load camera schedule.';}
 const bookings=await prisma.$queryRaw<{fixtureId:string;leagueId:string;homeName:string;awayName:string;kickoffAt:Date;pitch:string;state:string;status:string;url:string|null}[]>`
 SELECT b."fixtureId",b."leagueId",h.name AS "homeName",a.name AS "awayName",b."kickoffAt",b.pitch,b.state,f.status::text,f."sixflTvUrl" AS url
 FROM "VeoMatchBooking" b JOIN "Fixture" f ON f.id=b."fixtureId" JOIN "Team" h ON h.id=b."homeTeamId" JOIN "Team" a ON a.id=b."awayTeamId"
 WHERE (b."leagueId"=${leagueId} OR b."cameraKey"=${preview?.cameraKey??''})
 AND to_char(b."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London','YYYY-MM-DD')=${date} ORDER BY b."kickoffAt",b."fixtureId"`;
 return <section aria-label="SIXFL TV Priority filming plan" className="space-y-5 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/5 p-5 sm:p-6">
  <h2 className="text-xl font-bold">Score-based filming plan</h2>
  <p className="text-sm leading-6 text-white/70">Recorded-pitch eligibility is earned through on-time payment, fixture confirmation and completing match reports. Among eligible teams, SIXFL TV audience and award participation add engagement points, so fixtures involving teams that attract viewers and take part in nominations and voting can move up the camera order.</p>
  <form method="get" className="flex flex-wrap items-end gap-3"><label className="block text-sm">Match date (UK)<input type="date" name="date" required defaultValue={date} className="mt-2 block min-h-11 rounded-xl border border-white/20 bg-black/20 p-3"/></label><button className="min-h-11 rounded-xl border border-white/20 p-3">Show requests</button></form>
  {error&&<p role="alert" className="text-sm text-amber-100">{error}</p>}
  {preview&&!preview.settings.enabled&&<p className="text-sm text-white/65">SIXFL TV recorded-pitch priority is off. Existing accepted bookings remain visible.</p>}
  {preview?.cameraKey&&<>
   <p className="text-sm text-fuchsia-100">One camera · maximum {preview.settings.maxMatches} filmed matches across all leagues sharing this pitch this evening · {preview.choices.length} score-based bookings proposed.</p>
   <div className="space-y-3">{preview.fixtures.filter(f=>!f.bookingState).map(f=>{
     const chosen=preview!.choices.find(c=>c.fixtureId===f.id);
     return <div key={f.id} className="space-y-2 rounded-xl border border-white/15 p-4">
       <h3 className="font-semibold">{time(f.kickoffAt)} · {f.homeName} vs {f.awayName}</h3>
       <p className="text-sm text-white/70">{chosen?`Proposed camera pitch: ${chosen.pitch}${chosen.swapWithId?' — pitch swap only':''}`:f.locked?'Existing arrangement is protected; no new booking.':'No camera slot proposed.'}</p>
       <div className="grid gap-2 text-sm text-white/65 sm:grid-cols-2">
         <p>{f.homeName}: <strong>{f.homePriorityScore ?? 0}/100</strong> base · View Score {f.homeViewScore ?? 100} · +{f.homeEngagementBonus ?? 0} engagement · <strong>{f.homeAllocationScore ?? f.homePriorityScore ?? 0}/120 allocation</strong>{f.homePriority?' · eligible & confirmed':' · no active priority'}</p>
         <p>{f.awayName}: <strong>{f.awayPriorityScore ?? 0}/100</strong> base · View Score {f.awayViewScore ?? 100} · +{f.awayEngagementBonus ?? 0} engagement · <strong>{f.awayAllocationScore ?? f.awayPriorityScore ?? 0}/120 allocation</strong>{f.awayPriority?' · eligible & confirmed':' · no active priority'}</p>
       </div>
     </div>;
   })}</div>
   <FinaliseChoicesForm leagueId={leagueId} date={date} fingerprint={preview.fingerprint} count={preview.choices.length}/>
  </>}
  <div className="space-y-3"><h3 className="font-semibold">Accepted bookings and recordings</h3>{bookings.map(b=><div key={b.fixtureId} className="space-y-3 rounded-xl border border-white/15 p-4"><h4 className="font-semibold">{time(b.kickoffAt)} · {b.homeName} vs {b.awayName}</h4><p className="text-sm text-white/70">Pitch {b.pitch} · {b.state==='PLANNED'?'Filming confirmed':b.state==='READY'?'Recording ready':'Closed'}</p>{b.url&&<a href={b.url} target="_blank" rel="noopener noreferrer" className="text-sm text-fuchsia-100 underline">Watch recording</a>}{['PLANNED','READY'].includes(b.state)&&<RecordingOutcomeForm leagueId={b.leagueId} fixtureId={b.fixtureId} ready={b.state==='READY'} completed={b.status==='COMPLETED'}/>}</div>)}{!bookings.length&&<p className="text-sm text-white/60">No accepted filming bookings on this date.</p>}</div>
  <VeoChoiceHistory leagueId={leagueId}/>
  <p className="text-xs leading-5 text-white/55">SIXFL TV Priority is free. Filming decisions here never create or alter a team payment charge.</p>
 </section>;
}
