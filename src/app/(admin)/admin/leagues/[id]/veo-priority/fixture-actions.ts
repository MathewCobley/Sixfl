'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/requireAdmin';
import { finaliseFixtureVeoNight,setVeoRecordingOutcome,VeoBookingError } from '@/lib/veo/fixture-bookings';
export type VeoAdminState={ok:boolean;message:string};
export async function finaliseVeoChoicesAction(leagueId:string,date:string,_previous:VeoAdminState,form:FormData):Promise<VeoAdminState> {
  const {user}=await requireAdmin();
  if(!user?.id)return {ok:false,message:'Sign in as an administrator to confirm Veo bookings.'};
  if(form.get('reviewed')!=='on')return {ok:false,message:'Review the complete camera schedule before confirming.'};
  try {
    const count=await finaliseFixtureVeoNight(leagueId,date,user.id,String(form.get('fingerprint')??''));
    refresh();return {ok:true,message:`Confirmed ${count} Veo booking${count===1?'':'s'}. Original match fees and payments were not changed. Confirm usable footage after the game before billing the agreed £5.`};
  } catch(error) {return failure(error);}
}
export async function recordingOutcomeAction(leagueId:string,fixtureId:string,_previous:VeoAdminState,form:FormData):Promise<VeoAdminState> {
  const {user}=await requireAdmin();
  if(!user?.id)return {ok:false,message:'Sign in as an administrator to update recordings.'};
  const outcome=String(form.get('outcome')??'');
  if(!['READY','FAILED','CANCELLED'].includes(outcome)||form.get('reviewed')!=='on')return {ok:false,message:'Review and acknowledge the recording/charge decision.'};
  try {
    await setVeoRecordingOutcome({leagueId,fixtureId,actorId:user.id,outcome:outcome as 'READY'|'FAILED'|'CANCELLED',videoUrl:String(form.get('videoUrl')??''),note:String(form.get('note')??'')});
    refresh();return {ok:true,message:outcome==='READY'?'Recording saved. Only accepted paid requests receive one separate £5 Veo charge.':'Booking closed. Veo charges are void and any received Veo payments return to team credit. Original match fees are unchanged.'};
  } catch(error) {return failure(error);}
}
function refresh(){revalidatePath('/admin/leagues','layout');revalidatePath('/admin/fixtures');revalidatePath('/captain','layout');revalidatePath('/admin/payments');revalidatePath('/leagues','layout');}
function failure(error:unknown):VeoAdminState {if(!(error instanceof VeoBookingError))console.error('Veo decision failed',error);return {ok:false,message:error instanceof VeoBookingError?error.message:'The decision was not saved. Refresh and check the match details and video URL before trying again.'};}
