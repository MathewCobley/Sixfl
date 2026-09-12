'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VeoFixtureOffer, VeoMatchChoice } from '@/lib/veo/confirmation';

const options:[VeoMatchChoice,string,string][]=[
  ['NONE','No thanks','Confirm at your normal match fee, without requesting Veo Priority.'],
  ['MATCH','Yes, just this match','Request the camera pitch for this game only. No ongoing commitment.'],
  ['ONGOING','Yes, this and future matches','Request it for this game and save your preference for future matches in this league.'],
];
export default function VeoFixtureConfirmation({teamId,offer,confirmed,preview=true}:{teamId:string;offer:VeoFixtureOffer;confirmed:boolean;preview?:boolean}) {
  const router=useRouter(); const [choice,setChoice]=useState<VeoMatchChoice>(offer.choice);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(preview||busy)return;setBusy(true);setError('');setNotice('');
    try {
      const response=await fetch('/api/captain/veo/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teamId,fixtureId:offer.fixtureId,stamp:offer.fixtureStamp,
        ...(offer.closed?{}:{choice,terms:offer.termsVersion})})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Not saved. Please try again.');
      setNotice(data.message);if(data.warning)setError(data.warning);else router.refresh();
    }catch(e){setError(e instanceof Error?e.message:'The response could not be confirmed. Your choice is still here; please try again.');}
    finally{setBusy(false);}
  }
  const fields=<>
    {!offer.closed&&<fieldset disabled={preview||busy} className="space-y-3">
      <legend className="mb-3 text-base font-semibold text-white">Would you like this match filmed?</legend>
      <p className="mb-3 text-sm leading-6 text-white/80">Watch the game back and share it with your squad on SIXFL TV/YouTube. <strong>£5 extra for the whole team</strong> only if we confirm your place on the camera pitch.</p>
      {offer.ongoing&&<p className="text-sm leading-6 text-fuchsia-100">Veo Priority is your saved preference. Choose <strong>No thanks</strong> to skip this match without changing that preference.</p>}
      {options.map(([value,label,help])=><label key={value} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 ${choice===value?'border-fuchsia-300/60 bg-fuchsia-400/10':'border-white/15'}`}>
        <input type="radio" name="veoChoice" value={value} checked={choice===value} onChange={()=>setChoice(value)} className="mt-1 h-4 w-4 shrink-0" />
        <span><strong className="block text-sm text-white">{label}</strong><span className="mt-1 block text-xs leading-5 text-white/70">{help}</span></span>
      </label>)}
      <p className="text-xs leading-5 text-white/70">{offer.capacity} camera-pitch matches are available across the whole evening. Both paid options have the same priority. No place means no extra charge. Footage may be published publicly on SIXFL TV/YouTube. If recording fails, the £5 is cancelled or returned as team credit.</p>
    </fieldset>}
    {offer.closed&&<p className="text-sm leading-6 text-white/85">{offer.status==='ACCEPTED'?(offer.extraPence>0?'📹 Your Veo request is accepted. The separate £5 Veo add-on is listed in Team payments.':'📹 Your Veo request is accepted. There is no extra charge for this fixture.'):offer.status==='CANCELLED'?'The recording is unavailable. Any Veo add-on has been cancelled; payments received are returned as team credit.':offer.status==='EXISTING'?'This match already has a filming arrangement. Its agreed fee is unchanged.':'Veo bookings have closed for this match. No new Veo charge will be added.'}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-100">{notice}</p>}
    {error&&<p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm leading-6 text-red-100">{error}</p>}
    <button type={preview?'button':'submit'} disabled={preview||busy||(offer.closed&&confirmed)} className="min-h-12 w-full rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-4 py-3 font-semibold text-emerald-50 disabled:opacity-60">
      {busy?'Saving…':confirmed?(offer.closed?'✓ Team can play':'Save Veo choice'):'Confirm our team can play'}
    </button>
    {!offer.closed&&<p className="text-xs leading-5 text-white/65">Choosing a paid option agrees to a separate £5 team charge if accepted. No payment is taken now. Your normal match fee and attendance confirmation are separate from Veo.</p>}
  </>;
  return <div className="space-y-3">
    {preview&&<aside aria-label="Veo preview notice" className="rounded-xl border border-amber-300/20 p-3 text-xs leading-5 text-amber-100">Captain preview: the same choices are shown below, but nothing can be submitted here.</aside>}
    <section aria-label="Veo match choice" className="space-y-4 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-200">📹 SIXFL TV · Veo Priority</p>
      {preview?<div className="space-y-4">{fields}</div>:<form onSubmit={submit} className="space-y-4">{fields}</form>}
    </section>
    {offer.ongoing&&<StopFutureVeo teamId={teamId} leagueId={offer.leagueId} preview={preview}/>}
  </div>;
}
export function StopFutureVeo({teamId,leagueId,preview=true}:{teamId:string;leagueId:string;preview?:boolean}) {
  const router=useRouter();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function stop(){if(preview||busy)return;setBusy(true);try{const r=await fetch('/api/captain/veo/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'stop',teamId,leagueId})});const d=await r.json();setMessage(d.message||d.error);if(r.ok)router.refresh();}catch{setMessage('Not saved. Please try again.');}finally{setBusy(false);}}
  return <div className="space-y-2"><button type="button" disabled={preview||busy} onClick={stop} className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm text-white disabled:opacity-50">{busy?'Saving…':'Turn off future Veo Priority'}</button><p className="text-xs leading-5 text-white/65">Stops future automatic requests. Accepted bookings and one-match requests stay unchanged.</p>{message&&<p role="status" className="text-sm text-white">{message}</p>}</div>;
}
