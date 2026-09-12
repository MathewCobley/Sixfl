import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readPlayerPoolContactTargets, getPlayerPoolContactHistory } from "@/lib/player-pool/contact-history";
import { playerPoolChaseBlock, PLAYER_POOL_REMINDER_SOURCE } from "@/lib/player-pool/response-policy";
import { queuePlayerPoolResponseReminder } from "@/lib/player-pool/response-reminders";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const validRun = (s: string) => /^pp-response-[a-zA-Z0-9-]{8,80}$/.test(s);
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || !supplied) return false;
  const a=Buffer.from(secret), b=Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a,b);
}
async function snapshot() {
  const targets = await readPlayerPoolContactTargets();
  if (targets.length > 1000) throw new Error("Too many awaiting profiles for one reviewed run.");
  const hash = createHash("sha256").update(JSON.stringify(targets.map(p => [p.id,p.email,p.profileToken,p.status,p.profileSubmittedAt]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex");
  return { targets, hash };
}
/** Authenticated operational preview only. No GET sends or changes a record. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({error:"Unauthorized"},{status:401});
  const campaignId = request.nextUrl.searchParams.get("campaignId") || "";
  if (!validRun(campaignId)) return NextResponse.json({error:"Invalid campaign ID"},{status:400});
  if (request.nextUrl.searchParams.get("status") === "1") {
    const attempts = await prisma.notificationDispatch.findMany({where:{sourceType:PLAYER_POOL_REMINDER_SOURCE,metadata:{path:["bulkRunId"],equals:campaignId}},select:{id:true,status:true,sentAt:true,metadata:true,providerMessageId:true}});
    return NextResponse.json({campaignId,recorded:attempts.length, sent:attempts.filter(a=>a.status==="SENT" && a.sentAt && a.providerMessageId).length,
      pending:attempts.filter(a=>["QUEUED","PROCESSING"].includes(a.status)).length,
      failed:attempts.filter(a=>a.status==="FAILED").length,
      skipped:attempts.filter(a=>["SKIPPED","CANCELLED"].includes(a.status)).length,
      attempts:attempts.map(a=>({dispatchId:a.id,status:a.status,sentAt:a.sentAt,publicCode:(a.metadata as Record<string,unknown> | null)?.publicCode}))});
  }
  const {targets,hash}=await snapshot();
  const history=await getPlayerPoolContactHistory(targets);
  return NextResponse.json({campaignId,previewHash:hash,awaiting:targets.length,
    profiles:targets.map(p=>({publicCode:p.publicCode,blocked:playerPoolChaseBlock(p,history.get(p.id)!)})),
    note:"Preview only. Sending requires an explicit authenticated POST with this snapshot hash. No enquiry will be closed for silence."});
}
/** Dormant until an explicitly authorised operator posts a reviewed snapshot.
 * This route never drains unrelated notifications or invokes other cron jobs. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({error:"Unauthorized"},{status:401});
  const text=await request.text();
  if (text.length>2048) return NextResponse.json({error:"Request too large"},{status:413});
  let input: {campaignId?:string;previewHash?:string;confirm?:boolean};
  try { input=JSON.parse(text); } catch { return NextResponse.json({error:"Invalid JSON"},{status:400}); }
  if (!input || typeof input.campaignId!=="string" || !validRun(input.campaignId) || input.confirm!==true) return NextResponse.json({error:"An explicit campaign confirmation is required"},{status:400});
  const {targets,hash}=await snapshot();
  if (input.previewHash!==hash) return NextResponse.json({error:"Awaiting profiles changed. Review a fresh preview before sending."},{status:409});
  const summary={campaignId:input.campaignId,targeted:targets.length,queued:0,skipped:0,failed:0,details:[] as Array<{publicCode:string;status:string;reason?:string}>};
  for(let offset=0;offset<targets.length;offset+=6) {
    const batch=targets.slice(offset,offset+6);
    const results=await Promise.allSettled(batch.map(profile=>queuePlayerPoolResponseReminder({profileId:profile.id,
      origin:"player_pool_profile_bulk_reminder",originLabel:"User-authorised PlayerPool response chase via Railway operator job",bulkRunId:input.campaignId})));
    results.forEach((r,i)=>{
      const publicCode=batch[i].publicCode;
      if(r.status==="rejected") {summary.failed++;summary.details.push({publicCode,status:"FAILED",reason:"Queue operation failed; review server logs before retrying."});console.error("[playerpool-response] queue failure",publicCode,r.reason);}
      else if(!r.value.ok) {summary.skipped++;summary.details.push({publicCode,status:"SKIPPED",reason:r.value.message});}
      else if(r.value.dispatchStatus==="QUEUED") {summary.queued++;summary.details.push({publicCode,status:"QUEUED"});}
      else {summary.skipped++;summary.details.push({publicCode,status:r.value.dispatchStatus});}
    });
  }
  console.info("[playerpool-response-campaign]",JSON.stringify(summary));
  return NextResponse.json(summary);
}
