'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { confirmFixtureWithVeoAction,stopFutureVeoPriorityAction,type FixtureVeoFormState } from '@/app/captain/team/[teamid]/veo-priority/fixture-actions';
import type { FixtureVeoOffer } from '@/lib/veo/fixture-bookings';
import { VEO_FIXTURE_TERMS } from '@/lib/veo/fixture-choice';
type Props={teamId:string;fixtureId:string;leagueId:string;confirmed:boolean;offer:FixtureVeoOffer|null;preview:boolean};
const initial:FixtureVeoFormState={ok:false,attendanceConfirmed:false,message:''};
const button='min-h-12 w-full rounded-xl border border-emerald-300/30 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed';
function Feedback({state}:{state:FixtureVeoFormState}) { return state.message?<p role={state.ok?'status':'alert'} className={`rounded-xl border p-3 text-sm leading-6 ${state.ok?'border-emerald-300/30 text-emerald-100':'border-amber-300/30 text-amber-100'}`}>{state.message}</p>:null; }
function Fields({offer,disabled}:{offer:FixtureVeoOffer;disabled:boolean}) {
  return <fieldset key={offer.version} disabled={disabled} className="space-y-3 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4">
    <legend className="px-1 text-base font-bold text-white">📹 Would you like this match filmed?</legend>
    <p className="text-sm leading-6 text-white/80">Watch the game back and share it with your squad. Veo Priority costs <strong>£5 extra for the whole team</strong> if SIXFL confirms your place on the camera pitch and a usable recording is available.</p>
    <div className="space-y-3">{[
      ['NONE',offer.preference?'Skip Veo Priority for this match':'No thanks','Your usual match fee. This does not change your saved preference.'],
      ['MATCH','Yes, just this match','Request Veo Priority for this fixture only.'],
      ['ONGOING','Yes, this and future matches','Request it now and remember my choice for future confirmations in this league.'],
    ].map(([value,label,help])=><label key={value} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-white/15 p-3 text-sm text-white"><input type="radio" name="veoChoice" value={value} defaultChecked={offer.defaultChoice===value} className="mt-1 h-4 w-4 shrink-0"/><span><strong className="block">{label}</strong><span className="mt-1 block text-xs leading-5 text-white/65">{help}</span></span></label>)}</div>
    <p className="text-xs leading-5 text-white/65">By choosing either Yes option you agree to the £5 team charge for an accepted request with usable footage. No space or no usable recording means no extra charge. The £5 is billed separately after the recording is ready; your original match payment is untouched. Both request types have equal priority.</p>
    <p className="text-xs leading-5 text-white/65">There are limited filming spaces each night. Recordings may be published publicly on SIXFL TV/YouTube. A team choosing No thanks can still appear in its opponent’s recording without being charged.</p>
  </fieldset>;
}
function ChoiceStatus({offer}:{offer:FixtureVeoOffer|null}) {
  if (!offer) return null;
  const text=offer.bookingState==='READY'?'📹 Your recording is ready. Any accepted £5 Veo charge is shown separately in Team payments.'
    : ['FAILED','CANCELLED'].includes(offer.bookingState??'')?'📹 Veo recording unavailable. No Veo charge is due; any Veo payment received is returned to team credit.'
    : offer.requestStatus==='ACCEPTED'?`📹 Veo confirmed for this match.${offer.agreedPence===0?' This match remains free.':' £5 is agreed and will be billed after usable footage is confirmed.'}`
    : offer.bookingState==='PLANNED'?'📹 This match is scheduled for filming. You have no accepted paid request, so there is no extra Veo charge for your team.'
    : offer.requestStatus==='REQUESTED'?'📹 Veo requested — awaiting SIXFL confirmation. No extra charge yet.'
    : offer.requestStatus==='UNAVAILABLE'?'📹 No Veo space this time. Your usual match fee applies.'
    : offer.reason;
  return text?<div className="space-y-2"><p className="text-sm leading-6 text-fuchsia-100">{text}</p>{offer.videoUrl&&<a href={offer.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-fuchsia-100 underline">Watch your match</a>}</div>:null;
}
function FormContents({props,disabled,preview}:{props:Props;disabled:boolean;preview:boolean}) {
  const {offer,confirmed}=props;
  return <>
    <ChoiceStatus offer={offer}/>
    {confirmed&&<p className="font-semibold text-emerald-100">✓ Your team is confirmed to play</p>}
    {offer?.available&&<Fields offer={offer} disabled={disabled}/>}
    {(!confirmed||offer?.available)&&<button type={preview?'button':'submit'} disabled={disabled} className={button}>{disabled&&!preview?'Saving…':confirmed?'Save Veo choice':'Confirm our team can play'}</button>}
    {!confirmed&&<p className="text-xs leading-5 text-white/65">Veo is optional. Your team can confirm attendance without requesting filming.</p>}
  </>;
}
function LiveForm(props:Props) {
  const [state,action,pending]=useActionState(confirmFixtureWithVeoAction.bind(null,props.teamId,props.fixtureId),initial);
  const router=useRouter();
  useEffect(()=>{if(state.message)router.refresh();},[state,router]);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="confirmAttendance" value={props.confirmed?'no':'yes'}/>
    <input type="hidden" name="veoTerms" value={VEO_FIXTURE_TERMS}/>
    <input type="hidden" name="veoVersion" value={props.offer?.version??''}/>
    <Feedback state={state}/><FormContents props={props} disabled={pending} preview={false}/>
  </form>;
}
function LiveStop({teamId,leagueId}:{teamId:string;leagueId:string}) {
  const [state,action,pending]=useActionState(stopFutureVeoPriorityAction.bind(null,teamId,leagueId),initial);
  const router=useRouter();useEffect(()=>{if(state.ok)router.refresh();},[state,router]);
  return <form action={action} className="space-y-3"><Feedback state={state}/><button disabled={pending} className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm text-white">{pending?'Saving…':'Turn off future Veo Priority'}</button><p className="text-xs leading-5 text-white/60">Already accepted bookings and one-match requests stay in place.</p></form>;
}
export function StopFutureVeoForm({preview=true,...props}:{teamId:string;leagueId:string;preview?:boolean}) {
  return preview?<button type="button" disabled className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm text-white/70">Turn off future Veo Priority</button>:<LiveStop {...props}/>;
}
export default function FixtureVeoConfirmationForm(props:Props) {
  return <div className="space-y-4">
    {props.preview&&<aside aria-label="Fixture preview notice" className="rounded-xl border border-amber-300/25 p-3 text-sm text-amber-100">Preview only — these are the captain’s choices. Nothing can be saved from this preview.</aside>}
    {props.preview?<div data-veo-confirm-preview="true" className="space-y-4"><FormContents props={props} disabled preview/></div>:<LiveForm {...props}/>}
    {props.offer?.preference&&<StopFutureVeoForm teamId={props.teamId} leagueId={props.leagueId} preview={props.preview}/>}
  </div>;
}
