// Explicit one-off operator tool. Not imported by the website, cron or migrations.
// Run PREVIEW first; EXECUTE requires the same fixed run ID and profile cutoff.
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { getPlayerPoolContactHistory, playerPoolChaseBlock } from "../src/lib/player-pool/contact-history";
import { queuePlayerPoolResponseChase } from "../src/lib/player-pool/response-chase";

async function main() {
  const mode=process.env.PLAYERPOOL_CHASE_MODE || 'PREVIEW';
  const runId=process.env.PLAYERPOOL_CHASE_RUN_ID;
  const cutoff=new Date(process.env.PLAYERPOOL_CHASE_CUTOFF || 'invalid');
  if(!runId || !/^[a-zA-Z0-9_-]{8,100}$/.test(runId) || !Number.isFinite(cutoff.getTime())) throw new Error('Explicit run ID and cutoff are required.');
  if(!['PREVIEW','EXECUTE','REPORT'].includes(mode)) throw new Error('Invalid run mode.');
  if(mode==='REPORT') {
    const rows=await prisma.notificationDispatch.findMany({where:{metadata:{path:['bulkRunId'],equals:runId}},select:{id:true,status:true,sentAt:true,failureReason:true,sourceId:true}});
    console.log(JSON.stringify({mode,runId,counts:rows.reduce<Record<string,number>>((acc,row)=>({...acc,[row.status]:(acc[row.status]||0)+1}),{}),rows}));return;
  }
  const ids=await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "PlayerPoolProfile" WHERE status='INVITED' AND "profileSubmittedAt" IS NULL AND "createdAt"<=${cutoff} ORDER BY id`);
  const states=await getPlayerPoolContactHistory(ids.map(row=>row.id),prisma,{bulkRunId:runId});
  const preview=ids.map(row=>({publicCode:states.get(row.id)?.publicCode,reason:playerPoolChaseBlock(states.get(row.id))}));
  console.log(JSON.stringify({mode,runId,targeted:ids.length,eligible:preview.filter(row=>!row.reason).length,preview}));
  if(mode!=='EXECUTE')return;
  if(process.env.PLAYERPOOL_CHASE_CONFIRM!==runId)throw new Error('Run confirmation mismatch.');
  for(const row of ids){
    const result=await queuePlayerPoolResponseChase({profileId:row.id,bulkRunId:runId,origin:'player_pool_profile_bulk_reminder',originLabel:'User-authorised one-off PlayerPool follow-up via connected assistant'});
    console.log(JSON.stringify({publicCode:states.get(row.id)?.publicCode,ok:result.ok,status:result.ok?result.dispatchStatus:'SKIPPED',reason:result.ok?null:result.message}));
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'PlayerPool operation failed');process.exitCode=1;}).finally(()=>prisma.$disconnect());
