import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireCaptain } from '@/lib/requireCaptain';
import { confirmCaptainFixture, saveVeoMatchChoice, stopOngoingVeo, VeoConfirmationError, type VeoMatchChoice } from '@/lib/veo/confirmation';

export async function POST(request: Request) {
  const origin=request.headers.get('origin');
  let sameOrigin=false;try{sameOrigin=Boolean(origin&&new URL(origin).host===new URL(request.url).host);}catch{}
  if (!sameOrigin) return NextResponse.json({error:'Please submit from the SIXFL website.'},{status:403});
  if(Number(request.headers.get('content-length')??0)>8192) return NextResponse.json({error:'Invalid request.'},{status:400});
  let input:Record<string,unknown>;
  try { const text=await request.text(); if(text.length>8192) throw new Error(); input=JSON.parse(text); if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error(); }
  catch {return NextResponse.json({error:'Invalid request.'},{status:400});}
  const teamId=String(input.teamId??''),fixtureId=String(input.fixtureId??'');
  if(!teamId||teamId.length>200) return NextResponse.json({error:'Choose a team.'},{status:400});
  const access=await requireCaptain(teamId);
  if(access.accessMode!=='captain'||access.isAdmin||!access.isCaptain||!access.user?.id) return NextResponse.json({error:'Previews are read-only. Sign in as the team captain to save.'},{status:403});
  const actorId=access.user.id;
  let confirmed=false;
  try {
    if(input.action==='stop') {
      const leagueId=String(input.leagueId??'');
      await stopOngoingVeo(teamId,leagueId,actorId);
      revalidatePath(`/captain/team/${teamId}`,'layout');revalidatePath(`/admin/leagues/${leagueId}`,'layout');
      return NextResponse.json({message:'Future Veo Priority is off. Accepted bookings and one-match requests are unchanged.'});
    }
    const leagueId=await confirmCaptainFixture({teamId,fixtureId,actorId,stamp:typeof input.stamp==='string'?input.stamp:undefined});
    confirmed=true;
    let warning:string|null=null;
    if(input.choice!==undefined) {
      try { await saveVeoMatchChoice({teamId,fixtureId,actorId,choice:String(input.choice) as VeoMatchChoice,stamp:String(input.stamp??''),terms:String(input.terms??'')}); }
      catch(e) { if(!(e instanceof VeoConfirmationError)) console.error('Veo choice failed after attendance saved',e); warning=e instanceof VeoConfirmationError?e.message:'Your Veo choice could not be saved. Please try again; no extra fee has been added.'; }
    }
    revalidatePath(`/captain/team/${teamId}`,'layout');revalidatePath(`/admin/leagues/${leagueId}`,'layout');revalidatePath('/admin/fixtures');
    return NextResponse.json({confirmed,warning,message:warning?'Your team is confirmed to play, but your Veo choice was not saved.':input.choice&&input.choice!=='NONE'?'Your team is confirmed to play. Veo requested — awaiting confirmation. No payment has been taken.':'Your team is confirmed to play.'});
  } catch(e) {
    if(!(e instanceof VeoConfirmationError)) console.error('Veo fixture confirmation failed',e);
    return NextResponse.json({confirmed,error:e instanceof VeoConfirmationError?e.message:'We could not save that. Please try again.'},{status:400});
  }
}
