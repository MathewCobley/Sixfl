import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { ensurePlayerPoolTables } from "../../src/lib/player-pool/storage";
import { readPlayerPoolContactTargets, getPlayerPoolContactHistory } from "../../src/lib/player-pool/contact-history";
import { emptyContactHistory, playerPoolChaseBlock, PLAYER_POOL_RESPONSE_TEMPLATE_KEY } from "../../src/lib/player-pool/response-policy";
import { queuePlayerPoolResponseReminder, getPlayerPoolContactDeliveryBlock, declineAwaitingPlayerPoolProfile } from "../../src/lib/player-pool/response-reminders";
import PlayerPoolContactHistory from "../../src/components/admin/player-pool/PlayerPoolContactHistory";
import ResponsePage from "../../src/app/(public)/player-pool/profile/[token]/respond/page";
import { GET, POST } from "../../src/app/api/jobs/player-pool-response-campaign/route";
const url=new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_PLAYERPOOL_RESPONSE_TEST==="1" && url.hostname==="127.0.0.1" && url.pathname==="/sixfl_playerpool_response_test", "Isolated test database only");
globalThis.fetch=async()=>{throw new Error("External requests are prohibited in PlayerPool tests");};
const migration="prisma/migrations/20260912180000_playerpool_response_followup/migration.sql";
const apply=()=>execFileSync("psql",[process.env.DATABASE_URL!,"-v","ON_ERROR_STOP=1","-f",migration],{stdio:"pipe"});
const ago=(hours:number)=>new Date(Date.now()-hours*3600000);
before(async()=>{await ensurePlayerPoolTables();apply();});
after(async()=>{await prisma.$disconnect();});
let n=0;
async function target() {
  const id=randomUUID(), email=`${id}@example.invalid`,phone=`+4477009${String(++n).padStart(5,"0")}`;
  const p=await prisma.teamPlayerProspect.create({data:{firstName:"Test",email,phone,status:"INVITED"}});
  await prisma.$executeRaw`INSERT INTO "PlayerPoolProfile" (id,"prospectId","profileToken","publicCode","emailNormalized",status,"invitedAt","createdAt","updatedAt") VALUES (${id},${p.id},${id},${id},${email},'INVITED',${ago(100)},${ago(100)},${ago(100)})`;
  const recipient=await prisma.notificationRecipient.create({data:{sourceType:"GENERAL",sourceId:`player-pool-profile:${id}`,audience:"PLAYER",email,emailNormalized:email,phone,phoneNormalized:phone,preferences:{create:{emailEnabled:true,smsEnabled:true}}}});
  return {id,prospectId:p.id,recipient,email,phone};
}
async function dispatch(t:Awaited<ReturnType<typeof target>>,status:"SENT"|"QUEUED"|"FAILED"="SENT",hours=60,source="PLAYER_POOL_PROFILE_INVITE") {
  return prisma.notificationDispatch.create({data:{recipientId:t.recipient.id,channel:"EMAIL",audience:"PLAYER",status,subject:"Invitation",bodyText:"Test",sourceType:source,sourceId:t.id,sentAt:status==="SENT"?ago(hours):null,createdAt:ago(hours),variables:{profileUrl:`http://localhost:3000/player-pool/profile/${t.id}`}}});
}
const queue=(id:string,run?:string)=>queuePlayerPoolResponseReminder({profileId:id,origin:"player_pool_profile_bulk_reminder",originLabel:"Isolated test",bulkRunId:run});
const history=async(id:string)=> (await getPlayerPoolContactHistory(await readPlayerPoolContactTargets([id]),prisma,null,true)).get(id)!;
const load=(id:string)=>prisma.notificationDispatch.findUniqueOrThrow({where:{id},include:{recipient:true}});
async function reply(t:Awaited<ReturnType<typeof target>>) {
  const thread=await prisma.messageThread.create({data:{channel:"EMAIL",sourceType:"PLAYER_PROSPECT",sourceId:t.prospectId,contactEmail:t.email,emailNormalized:t.email}});
  return prisma.messageEntry.create({data:{threadId:thread.id,channel:"EMAIL",direction:"INBOUND",participantRole:"CONTACT",body:"Not looking now, thanks",fromEmail:t.email,receivedAt:ago(1)}});
}
test("silence is not a decline; exact 48-hour boundary and terminal states",()=>{
  const p={status:"INVITED",profileSubmittedAt:null,email:"p@example.invalid",profileToken:"token"};
  const h=emptyContactHistory(), now=new Date();
  assert.equal(playerPoolChaseBlock(p,h,now),null);
  h.latestSentAt=new Date(now.getTime()-48*3600000+1);assert.match(playerPoolChaseBlock(p,h,now)!,/48/);
  h.latestSentAt=new Date(now.getTime()-48*3600000);assert.equal(playerPoolChaseBlock(p,h,now),null);
  for(const status of ["PAUSED","JOINED","NOT_LOOKING","AVAILABLE"])assert.match(playerPoolChaseBlock({...p,status},h)!,/No longer/);
});
test("original invitations and queued attempts remain distinct on the native card",async()=>{
  const t=await target();await dispatch(t,"SENT");await dispatch(t,"QUEUED",1,"PLAYER_POOL_PROFILE_NUDGE");
  const h=await history(t.id);assert.equal(h.events.length,2);assert.equal(h.pendingCount,1);
  const html=renderToStaticMarkup(<PlayerPoolContactHistory history={h}/>);
  assert.match(html,/Profile invitation/);assert.match(html,/QUEUED/);assert.match(html,/not yet sent/);assert.doesNotMatch(html,/No linked delivery/);
});
test("concurrent manual and bulk requests queue one email and preserve template metadata",async()=>{
  const t=await target();await dispatch(t);
  const result=await Promise.all(Array.from({length:4},()=>queue(t.id,"pp-response-concurrency")));
  assert.equal(result.filter(r=>r.ok).length,1);
  const d=await prisma.notificationDispatch.findMany({where:{sourceId:t.id,sourceType:"PLAYER_POOL_PROFILE_NUDGE"},include:{template:true}});
  assert.equal(d.length,1);assert.equal(d[0].template?.key,PLAYER_POOL_RESPONSE_TEMPLATE_KEY);
  assert.match(d[0].bodyText,/Please let us know either way/);assert.match(d[0].bodyText,/respond/);
  assert.match(d[0].bodyHtml!,/respond/);assert.doesNotMatch(d[0].bodyHtml!,/\{\{/);
});
test("recent contact, pending messages and replies prevent fresh chases",async()=>{
  for(const status of ["SENT","QUEUED"] as const){const t=await target();await dispatch(t,status,1);assert.equal((await queue(t.id)).ok,false);}
  const t=await target();await dispatch(t);await reply(t);const r=await queue(t.id);
  assert.equal(r.ok,false);if(!r.ok)assert.match(r.message,/reply/);
  assert.ok((await history(t.id)).latestReplyAt);
});
test("suppression under another recipient identity is respected without resetting opt-ins",async()=>{
  const t=await target();await prisma.notificationRecipient.create({data:{sourceType:"LEAD",sourceId:randomUUID(),audience:"LEAD",email:t.email,isSuppressed:true}});
  assert.equal((await queue(t.id)).ok,false);
  const other=await target();await prisma.notificationRecipient.update({where:{id:other.recipient.id},data:{transactionalEmailOptIn:false}});
  assert.equal((await queue(other.id)).ok,false);
  assert.equal((await prisma.notificationRecipient.findUniqueOrThrow({where:{id:other.recipient.id}})).transactionalEmailOptIn,false);
});
test("existing squad identities and shared PlayerPool emails require review",async()=>{
  const t=await target();const user=await prisma.user.create({data:{email:t.email}});
  const team=await prisma.team.create({data:{name:randomUUID(),claimCode:randomUUID()}});
  await prisma.teamMember.create({data:{userId:user.id,teamId:team.id,role:"PLAYER"}});assert.equal((await queue(t.id)).ok,false);
  const a=await target(), b=await target();await prisma.teamPlayerProspect.update({where:{id:b.prospectId},data:{email:a.email}});
  const result=await queue(a.id);assert.equal(result.ok,false);if(!result.ok)assert.match(result.message,/shared/);
});
test("delivery guard rechecks inbound replies, changed contacts and closed profiles",async()=>{
  const t=await target();const q=await queue(t.id);assert.ok(q.ok);if(!q.ok)return;
  assert.equal(await getPlayerPoolContactDeliveryBlock(await load(q.dispatchId)),null);
  await reply(t);assert.match((await getPlayerPoolContactDeliveryBlock(await load(q.dispatchId)))!,/reply/);
  const a=await target();const aq=await queue(a.id);assert.ok(aq.ok);if(!aq.ok)return;
  await prisma.teamPlayerProspect.update({where:{id:a.prospectId},data:{email:"changed@example.invalid"}});
  assert.match((await getPlayerPoolContactDeliveryBlock(await load(aq.dispatchId)))!,/changed/);
});
test("opening No link cannot decline; explicit response is idempotent and preserves unrelated records",async()=>{
  const t=await target();const q=await queue(t.id);assert.ok(q.ok);if(!q.ok)return;
  const other=await dispatch(t,"QUEUED",1,"UNRELATED_NOTICE");
  await ResponsePage({params:Promise.resolve({token:t.id}),searchParams:Promise.resolve({})});
  assert.equal((await readPlayerPoolContactTargets([t.id]))[0].status,"INVITED");
  assert.equal(await declineAwaitingPlayerPoolProfile(t.id),true);assert.equal(await declineAwaitingPlayerPoolProfile(t.id),true);
  assert.equal((await readPlayerPoolContactTargets([t.id]))[0].status,"NOT_LOOKING");
  const events=await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "PlayerPoolResponseEvent" WHERE "profileId"=${t.id}`;assert.equal(events.length,1);
  assert.equal((await load(q.dispatchId)).status,"CANCELLED");assert.equal((await load(other.id)).status,"QUEUED");
  assert.equal((await prisma.teamPlayerProspect.findUniqueOrThrow({where:{id:t.prospectId}})).status,"INVITED");
  assert.match(renderToStaticMarkup(<PlayerPoolContactHistory history={await history(t.id)}/>),/No longer looking/);
  assert.equal((await queue(t.id)).ok,false);
});
test("completed profiles cannot be closed via an old link",async()=>{
  const t=await target();await prisma.$executeRaw`UPDATE "PlayerPoolProfile" SET "profileSubmittedAt"=NOW(),status='AVAILABLE' WHERE id=${t.id}`;
  assert.equal(await declineAwaitingPlayerPoolProfile(t.id),false);assert.equal((await readPlayerPoolContactTargets([t.id]))[0].status,"AVAILABLE");
});
test("operator access fails closed; preview and stale confirmation cannot queue",async()=>{
  const endpoint="http://localhost:3000/api/jobs/player-pool-response-campaign?campaignId=pp-response-test-run";
  assert.equal((await GET(new NextRequest(endpoint))).status,401);
  const secret=process.env.CRON_SECRET;delete process.env.CRON_SECRET;
  assert.equal((await GET(new NextRequest(endpoint,{headers:{authorization:"Bearer test"}}))).status,401);process.env.CRON_SECRET=secret;
  const headers={authorization:`Bearer ${secret}`};
  const before=await prisma.notificationDispatch.count();const res=await GET(new NextRequest(endpoint,{headers}));assert.equal(res.status,200);
  const json=await res.json();assert.ok(json.previewHash);assert.equal(await prisma.notificationDispatch.count(),before);
  assert.equal((await POST(new NextRequest(endpoint,{method:"POST",headers,body:JSON.stringify({campaignId:"pp-response-test-run",confirm:true,previewHash:"stale"})}))).status,409);
  assert.equal(await prisma.notificationDispatch.count(),before);
});
test("migration is repeatable and never overwrites customised response content",async()=>{
  await prisma.notificationTemplate.update({where:{key:PLAYER_POOL_RESPONSE_TEMPLATE_KEY},data:{body:"Admin customised content",isActive:false}});
  apply();apply();const t=await prisma.notificationTemplate.findUniqueOrThrow({where:{key:PLAYER_POOL_RESPONSE_TEMPLATE_KEY}});
  assert.equal(t.body,"Admin customised content");assert.equal(t.isActive,false);
});
test("native queue paths, provider guards and props refresh remain wired",()=>{
  const processor=readFileSync("src/lib/notifications/processor.ts","utf8");assert.equal((processor.match(/await getPlayerPoolContactDeliveryBlock\(dispatch\)/g)||[]).length,2);
  assert.match(readFileSync("src/lib/player-pool/profile-sms-reminders.ts","utf8"),/playerPoolChaseBlock/);
  assert.match(readFileSync("src/components/admin/player-pool/PlayerPoolNudgeButton.tsx","utf8"),/useEffect/);
  assert.match(readFileSync("src/app/api/admin/player-pool/bulk-profile-reminders/route.ts","utf8"),/queuePlayerPoolProfileReminder/);
});
