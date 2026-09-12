'use server';
import { revalidatePath } from 'next/cache';
import { requireCaptain } from '@/lib/requireCaptain';
import { confirmCaptainAttendance, saveFixtureVeoChoice, stopFutureVeoPriority, VeoBookingError } from '@/lib/veo/fixture-bookings';
import { parseVeoFixtureChoice } from '@/lib/veo/fixture-policy';
export type FixtureVeoFormState={ok:boolean;attendanceConfirmed:boolean;message:string};
function refresh(teamId:string) {
  revalidatePath(`/captain/team/${teamId}`,'layout');
  revalidatePath('/admin/leagues','layout');
  revalidatePath('/admin/fixtures');
}
export async function confirmFixtureWithVeoAction(teamId:string,fixtureId:string,_previous:FixtureVeoFormState,form:FormData):Promise<FixtureVeoFormState> {
  const access=await requireCaptain(teamId);
  if (access.accessMode!=='captain' || access.isAdmin || !access.isCaptain || !access.user?.id) return {ok:false,attendanceConfirmed:false,message:'Preview only — no confirmation or request has been sent.'};
  let attendanceConfirmed=false;
  try {
    // Confirmation has its own validated transaction and remains saved even if the
    // optional request is stale/unavailable. No Veo choice can create a charge here.
    if (form.get('confirmAttendance')==='yes') { await confirmCaptainAttendance(fixtureId,teamId,access.user.id); attendanceConfirmed=true; }
    if (form.has('veoChoice')) {
      const choice=parseVeoFixtureChoice(form.get('veoChoice'));
      await saveFixtureVeoChoice({fixtureId,teamId,actorId:access.user.id,choice,termsVersion:String(form.get('veoTerms')??''),version:String(form.get('veoVersion')??'')});
      refresh(teamId);
      return {ok:true,attendanceConfirmed,message:choice==='NONE'?'Your team is confirmed. No Veo Priority requested for this match. Your saved future preference is unchanged.':`Your team is confirmed. Veo requested — awaiting SIXFL confirmation.${choice==='ONGOING'?' Your preference is also saved for future confirmations.':''} No extra payment has been taken.`};
    }
    refresh(teamId);
    return {ok:true,attendanceConfirmed,message:'Your team is confirmed to play. Existing Veo arrangements are unchanged.'};
  } catch(error) {
    refresh(teamId);
    if (!(error instanceof VeoBookingError)) console.error('Fixture/Veo choice could not be completed',error);
    const detail=error instanceof VeoBookingError?error.message:'Please refresh and try again. Your original match fee has not changed.';
    return {ok:false,attendanceConfirmed,message:attendanceConfirmed?`Your team IS confirmed to play, but the Veo choice was not saved. ${detail}`:detail};
  }
}
export async function stopFutureVeoPriorityAction(teamId:string,leagueId:string,_previous:FixtureVeoFormState):Promise<FixtureVeoFormState> {
  const access=await requireCaptain(teamId);
  if (access.accessMode!=='captain' || access.isAdmin || !access.isCaptain || !access.user?.id) return {ok:false,attendanceConfirmed:false,message:'Preview only — no preference was changed.'};
  try {
    await stopFutureVeoPriority(teamId,leagueId,access.user.id);refresh(teamId);
    return {ok:true,attendanceConfirmed:false,message:'Future Veo Priority is off. Pending recurring requests were withdrawn; one-match requests and already accepted bookings are unchanged.'};
  } catch(error) { return {ok:false,attendanceConfirmed:false,message:error instanceof VeoBookingError?error.message:'Could not save the preference. Please try again.'}; }
}
