import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/requireAdmin';
import { prisma } from '@/lib/prisma';
import { finaliseConfirmationVeoNight, failVeoRecording, VeoConfirmationError } from '@/lib/veo/confirmation';
import { queueVeoNightNotices } from '@/lib/veo/confirmation-notices';
export async function POST(request:Request) {
  const origin=request.headers.get('origin');
  let sameOrigin=false;try{sameOrigin=Boolean(origin&&new URL(origin).host===new URL(request.url).host);}catch{}
  if(!sameOrigin) return NextResponse.json({error:'Use the SIXFL admin page.'},{status:403});
  const {user}=await requireAdmin();if(!user?.id||user.role!=='ADMIN')return NextResponse.json({error:'Administrator access required.'},{status:403});
  let data:Record<string,unknown>;
  try{const body=await request.text();if(body.length>8192)throw new Error();data=JSON.parse(body);if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
  const leagueId=String(data.leagueId??'');let nightId='',message='';
  try {
    if(data.action==='fail') {
      const fixtureId=String(data.fixtureId??'');
      await failVeoRecording({leagueId,fixtureId,actorId:user.id,reason:String(data.reason??'')});
      const [row]=await prisma.$queryRaw<{nightId:string}[]>`SELECT "nightId" FROM "VeoMatchDecision" WHERE "fixtureId"=${fixtureId} AND "leagueId"=${leagueId}`;
      nightId=row?.nightId??'';message='Recording marked unavailable. Unpaid Veo add-ons are cancelled; payments received are returned as team credit.';
    }else if(data.action==='notify') {
      const [row]=await prisma.$queryRaw<{nightId:string}[]>`SELECT "nightId" FROM "VeoMatchDecision" WHERE "nightId"=${String(data.nightId??'')} AND "leagueId"=${leagueId} LIMIT 1`;
      if(!row)throw new VeoConfirmationError('Night not found in this league.');nightId=row.nightId;message='Booking updates checked.';
    }else{
      if(data.reviewed!==true)throw new VeoConfirmationError('Review the whole camera night and tick the confirmation first.');
      const result=await finaliseConfirmationVeoNight({leagueId,date:String(data.date??''),actorId:user.id,digest:String(data.digest??'')});
      nightId=result.nightId;message=result.alreadyFinalised?'This night was already finalised. No duplicate charges were created.':`Veo bookings finalised. £${(result.chargedPence/100).toFixed(2)} in separate Veo add-ons created. Original match charges are unchanged.`;
    }
    const notices=await queueVeoNightNotices(nightId,user.id);
    revalidatePath('/captain/team/[teamid]','layout');revalidatePath('/admin/leagues/[id]','layout');revalidatePath('/admin/fixtures');revalidatePath('/admin/payments');revalidatePath('/leagues/[slug]','layout');
    return NextResponse.json({message:message+(notices.pending?` ${notices.pending} team updates still need queueing; use Retry booking updates.`:' Team updates are in the normal notification queue.')});
  }catch(e){if(!(e instanceof VeoConfirmationError))console.error('Veo night action failed',e);return NextResponse.json({error:e instanceof VeoConfirmationError?e.message:'The action could not be completed. Refresh to check the saved state before retrying.'},{status:400});}
}
