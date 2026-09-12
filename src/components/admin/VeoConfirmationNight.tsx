import { previewConfirmationVeoNight,readConfirmationVeoDecisions,VeoConfirmationError } from '@/lib/veo/confirmation';
import VeoNightControls,{VeoRecordingFailure} from './VeoNightControls';
import { saveVeoVideo } from '@/app/(admin)/admin/leagues/[id]/veo-priority/actions';
const money=(n:number)=>`£${(n/100).toFixed(2)}`;
export default async function VeoConfirmationNight({leagueId,date}:{leagueId:string;date:string}) {
 let plan:Awaited<ReturnType<typeof previewConfirmationVeoNight>>=null,error='';
 try{plan=await previewConfirmationVeoNight(leagueId,date);}catch(e){if(e instanceof VeoConfirmationError)error=e.message;else throw e;}
 const saved=await readConfirmationVeoDecisions(leagueId,date);
 return <section aria-label="Veo confirmation night" className="space-y-5 rounded-2xl border border-fuchsia-300/25 bg-fuchsia-500/5 p-5 text-white">
  <h2 className="text-xl font-semibold">Veo requests and final bookings</h2>
  <p className="max-w-4xl text-sm leading-6 text-white/75">Captains choose when confirming a fixture: no thanks, this match only, or this and future matches. Publication keeps the normal match fee. Finalise here after reviewing requests: only accepted paying teams receive a separate £5 Veo add-on. This covers the whole camera evening, not three matches per division.</p>
  <form method="get" className="flex flex-wrap items-end gap-3"><label className="text-sm">Match date<input type="date" name="date" required defaultValue={date} className="mt-2 block min-h-11 rounded-xl border border-white/20 bg-black/30 px-3 py-2"/></label><button className="min-h-11 rounded-xl border border-white/20 px-4 py-2">Show camera night</button></form>
  {error&&<p role="alert" className="text-amber-100">{error}</p>}
  {!plan&&!error&&<p className="text-sm text-white/70">Veo is off for this league. Existing decisions remain below.</p>}
  {plan&&!plan.nightId&&<>
   <p className="text-sm text-white/70">Capacity: {plan.capacity} filmed matches across all leagues sharing this pitch. Opponents and kick-off times will not change. Already agreed camera fixtures stay protected.</p>
   <div className="grid gap-3 md:grid-cols-2">{plan.items.map(f=><article key={f.fixtureId} className="space-y-2 rounded-xl border border-white/15 p-4"><h3 className="font-semibold">{f.homeName} vs {f.awayName}</h3><p className="text-sm text-white/70">{new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(new Date(f.kickoffAt))} · Pitch {f.originalPitch} {f.pitch!==f.originalPitch?`→ ${f.pitch}`:''}</p><p className="text-sm">{f.locked?'Existing / unavailable for reallocation':f.allocated?'📹 Camera pitch proposed':'No camera place proposed'}</p><p className="text-sm text-white/75">{f.homeName}: {f.homeRequested?'requested':'no paid request'} · {money(f.homeExtra)} extra<br/>{f.awayName}: {f.awayRequested?'requested':'no paid request'} · {money(f.awayExtra)} extra</p></article>)}</div>
   {!plan.canFinalise&&<p className="text-amber-100">All fixtures must be published, and this night must not have started.</p>}
  </>}
  {plan&&<VeoNightControls leagueId={leagueId} date={date} digest={plan.digest} canFinalise={plan.canFinalise} nightId={plan.nightId} missing={plan.missingConfirmations}/>}
  {saved.map(d=><article key={d.fixtureId} className="space-y-3 rounded-xl border border-white/15 p-4"><h3 className="font-semibold">{d.homeName} vs {d.awayName}</h3><p className="text-sm">{d.failedAt?'Recording unavailable — Veo add-ons cancelled / payments credited':d.allocated?'📹 Veo booking confirmed':'No Veo place — no add-on'} · Pitch {d.pitch}</p><p className="text-sm text-white/70">Veo add-ons agreed: {d.homeName} {money(d.homeExtraPence)} · {d.awayName} {money(d.awayExtraPence)}</p>{d.allocated&&!d.failedAt&&<><form action={saveVeoVideo.bind(null,d.leagueId)} className="space-y-2"><input type="hidden" name="fixtureId" value={d.fixtureId}/><input type="hidden" name="date" value={date}/><label className="block text-sm">YouTube / SIXFL TV link<input name="videoUrl" type="url" defaultValue={String(d.sixflTvUrl??'')} className="mt-2 block min-h-11 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2"/></label><button className="min-h-11 rounded-xl border border-white/20 px-4 py-2">Save video link</button></form><VeoRecordingFailure fixtureId={d.fixtureId} leagueId={d.leagueId}/></>}</article>)}
 </section>;
}
