import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { ensurePlayerPoolTables } from "../src/lib/player-pool/storage";
import { getPlayerPoolContactHistory, playerPoolChaseBlock, RESPONSE_TEMPLATE_KEY } from "../src/lib/player-pool/contact-history";
import { queuePlayerPoolResponseChase, getPlayerPoolResponseDeliveryBlock, closeAwaitingPlayerPoolProfile } from "../src/lib/player-pool/response-chase";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PlayerPoolContactHistory from "../src/components/admin/player-pool/PlayerPoolContactHistory";

const url = new URL(process.env.DATABASE_URL!);
assert.ok(process.env.SIXFL_POOL_RESPONSE_TEST === "1" && url.hostname === "127.0.0.1" && url.pathname === "/sixfl_pool_response_test", "Isolated PostgreSQL only");
const migration = 'prisma/migrations/20260912115000_playerpool_response_chase/migration.sql';
const migrate = () => execFileSync('psql',[process.env.DATABASE_URL!, '-X','-v','ON_ERROR_STOP=1','-f',migration],{stdio:'pipe'});
const ago=(hours:number)=>new Date(Date.now()-hours*3600000);
before(async()=>{await ensurePlayerPoolTables();migrate();});
after(async()=>{await prisma.$disconnect();});
async function target(){
 const id=randomUUID(); const token=randomUUID().replaceAll('-','');
 const prospect=await prisma.teamPlayerProspect.create({data:{firstName:'Test',lastName:'Player',email:`${id}@example.invalid`,phone:null}});
 await prisma.$executeRaw(Prisma.sql`INSERT INTO "PlayerPoolProfile" (id,"prospectId","profileToken","publicCode","emailNormalized",status,"invitedAt","createdAt","updatedAt") VALUES (${id},${prospect.id},${token},${id},${prospect.email!},'INVITED',${ago(100)},${ago(100)},NOW())`);
 return {id,token,prospect};
}
const state=async(id:string)=>(await getPlayerPoolContactHistory([id])).get(id)!;
const queue=(id:string,bulkRunId=randomUUID())=>queuePlayerPoolResponseChase({profileId:id,bulkRunId,origin:'player_pool_profile_bulk_reminder',originLabel:'Isolated test'});
const dispatch=(id:string)=>prisma.notificationDispatch.findUniqueOrThrow({where:{id},include:{recipient:true}});
async function history(t:Awaited<ReturnType<typeof target>>,sourceType='PLAYER_POOL_PROFILE_INVITE',status:'SENT'|'QUEUED'|'FAILED'='SENT',hours=60){
 const recipient=await prisma.notificationRecipient.create({data:{sourceType:'GENERAL',sourceId:randomUUID(),audience:'PLAYER',email:t.prospect.email,emailNormalized:t.prospect.email}});
 return prisma.notificationDispatch.create({data:{recipientId:recipient.id,channel:'EMAIL',audience:'PLAYER',sourceId:t.id,sourceType,status,bodyText:'Existing record',createdAt:ago(hours),sentAt:status==='SENT'?ago(hours):null}});
}
async function reply(t:Awaited<ReturnType<typeof target>>){
 const thread=await prisma.messageThread.create({data:{sourceType:'TEAM_PLAYER_PROSPECT',sourceId:t.prospect.id,emailNormalized:t.prospect.email,channel:'EMAIL'}});
 await prisma.messageEntry.create({data:{threadId:thread.id,direction:'INBOUND',channel:'EMAIL',body:'No, thanks',receivedAt:new Date()}});
}
test('original invitation is shown separately from a reminder without inventing sent history',async()=>{
 const t=await target(); assert.equal((await state(t.id)).lastSentAt,null);
 const d=await history(t); const s=await state(t.id);
 assert.equal(s.events[0].kind,'Invitation');assert.equal(s.events[0].id,d.id);assert.ok(s.lastSentAt);assert.equal(playerPoolChaseBlock(s),null);
 const html=renderToStaticMarkup(createElement(PlayerPoolContactHistory,{state:s}));assert.match(html,/Invitation/);assert.match(html,/not proof it was read/);
});
test('queued and failed records do not count as sent',async()=>{
 const t=await target(); await history(t,undefined,'QUEUED');const s=await state(t.id);assert.equal(s.lastSentAt,null);assert.match(playerPoolChaseBlock(s)!,/already queued/);
 const f=await target();await history(f,undefined,'FAILED');assert.equal((await state(f.id)).lastSentAt,null);
});
test('legacy prospect source and metadata retain their real history',async()=>{
 const t=await target();const d=await history(t,'PLAYER_POOL_PROFILE_NUDGE');await prisma.notificationDispatch.update({where:{id:d.id},data:{sourceId:t.prospect.id}});
 assert.equal((await state(t.id)).events[0].id,d.id);
});
test('recent contact blocks a repeat, with an exact 48-hour boundary',async()=>{
 const t=await target(); await history(t,undefined,'SENT',1); assert.match(playerPoolChaseBlock(await state(t.id))!,/48 hours/);
 const s=await state(t.id);s.lastSentAt=new Date('2026-09-10T12:00:00Z');assert.equal(playerPoolChaseBlock(s,new Date('2026-09-12T12:00:00Z')),null);
});
test('concurrent individual/bulk actions queue only one response email',async()=>{
 const t=await target();const all=await Promise.all([queue(t.id),queue(t.id),queue(t.id),queue(t.id)]);assert.equal(all.filter(x=>x.ok).length,1);
 const q=all.find(x=>x.ok)!;if(!q.ok)throw Error('missing');assert.equal(q.dispatchStatus,'QUEUED');
 assert.match(q.dispatch.bodyText,/Without a response and a completed profile/);assert.match(q.dispatch.bodyHtml!,/Tell us yes or no/);
 assert.equal(await getPlayerPoolResponseDeliveryBlock(await dispatch(q.dispatch.id)),null);
});
test('same named run cannot resend later after a restart',async()=>{
 const t=await target();const run=randomUUID();const q=await queue(t.id,run);assert.ok(q.ok);if(!q.ok)return;
 await prisma.notificationDispatch.update({where:{id:q.dispatch.id},data:{status:'SENT',sentAt:ago(80)}});
 const again=await queue(t.id,run);assert.equal(again.ok,false);
});
test('opt-outs are never reset by contact upsert',async()=>{
 const t=await target();const r=await prisma.notificationRecipient.create({data:{sourceType:'GENERAL',sourceId:`player-pool-profile:${t.id}`,audience:'PLAYER',emailNormalized:t.prospect.email,transactionalEmailOptIn:false}});
 assert.equal((await queue(t.id)).ok,false);assert.equal((await prisma.notificationRecipient.findUniqueOrThrow({where:{id:r.id}})).transactionalEmailOptIn,false);
});
test('suppression on another record for the email is respected',async()=>{
 const t=await target();await prisma.notificationRecipient.create({data:{sourceType:'LEAD',sourceId:randomUUID(),audience:'LEAD',emailNormalized:t.prospect.email,isSuppressed:true}});
 assert.equal((await queue(t.id)).ok,false);
});
test('linked-contact replies block another chase without interpreting the answer or changing status',async()=>{
 const t=await target();await reply(t);assert.equal((await queue(t.id)).ok,false);const s=await state(t.id);assert.equal(s.status,'INVITED');assert.ok(s.lastReplyAt);
});
test('a reply after queueing stops both email and SMS at the provider boundary',async()=>{
 const t=await target();const q=await queue(t.id);assert.ok(q.ok);if(!q.ok)return;
 await reply(t);const d=await dispatch(q.dispatch.id);assert.match((await getPlayerPoolResponseDeliveryBlock(d))!,/Reply/);
 assert.match((await getPlayerPoolResponseDeliveryBlock({...d,sourceType:'PLAYER_POOL_PROFILE_SMS_NUDGE_1',channel:'SMS'}))!,/Reply/);
});
test('completion and changed contact stop queued email',async()=>{
 const t=await target();const q=await queue(t.id);assert.ok(q.ok);if(!q.ok)return;const d=await dispatch(q.dispatch.id);
 await prisma.teamPlayerProspect.update({where:{id:t.prospect.id},data:{email:'changed@example.invalid'}});assert.match((await getPlayerPoolResponseDeliveryBlock(d))!,/changed/);
 await prisma.$executeRaw`UPDATE "PlayerPoolProfile" SET status='AVAILABLE',"profileSubmittedAt"=NOW() WHERE id=${t.id}`;
 assert.match((await getPlayerPoolResponseDeliveryBlock(d))!,/No longer/);
});
test('explicit No closes only an awaiting profile, records the response, and cancels unsent chases',async()=>{
 const t=await target();const q=await queue(t.id);assert.ok(q.ok);if(!q.ok)return;const before=await prisma.teamPlayerProspect.findUniqueOrThrow({where:{id:t.prospect.id}});
 await closeAwaitingPlayerPoolProfile(t.token);await closeAwaitingPlayerPoolProfile(t.token);
 const s=await state(t.id);assert.equal(s.status,'NOT_LOOKING');assert.ok(s.lastReplyAt);assert.ok(s.events.some(x=>x.channel==='WEB'));
 assert.equal((await dispatch(q.dispatch.id)).status,'CANCELLED');assert.equal(await prisma.playerPoolResponseDecision.count({where:{profileId:t.id}}),1);
 assert.deepEqual(await prisma.teamPlayerProspect.findUniqueOrThrow({where:{id:t.prospect.id}}),before);
});
test('old response links cannot close completed or joined profiles',async()=>{
 for(const status of ['AVAILABLE','JOINED','PAUSED']){
  const t=await target();await prisma.$executeRaw`UPDATE "PlayerPoolProfile" SET status=${status} WHERE id=${t.id}`;await closeAwaitingPlayerPoolProfile(t.token);assert.equal((await state(t.id)).status,status);
 }
 await assert.rejects(closeAwaitingPlayerPoolProfile('bad'));
});
test('existing squad membership is held for review',async()=>{
 const t=await target();const u=await prisma.user.create({data:{email:t.prospect.email,teamMembers:{create:{role:'PLAYER',team:{create:{name:randomUUID(),claimCode:randomUUID()}}}}}});
 assert.equal((await queue(t.id)).ok,false);assert.equal((await state(t.id)).status,'INVITED');
});
test('duplicate queued emails are ordered deterministically before sending',async()=>{
 const t=await target();const q=await queue(t.id);assert.ok(q.ok);if(!q.ok)return;const d=await dispatch(q.dispatch.id);
 const later=await prisma.notificationDispatch.create({data:{recipientId:d.recipientId,channel:'EMAIL',audience:'PLAYER',sourceType:d.sourceType,sourceId:d.sourceId,bodyText:d.bodyText,variables:d.variables as Prisma.InputJsonValue,createdAt:new Date(d.createdAt.getTime()+10)}});
 assert.match((await getPlayerPoolResponseDeliveryBlock(await dispatch(later.id)))!,/earlier pending/);
 assert.equal(await getPlayerPoolResponseDeliveryBlock(d),null);
});
test('migration keeps custom templates and queued/sent history intact',async()=>{
 await prisma.notificationTemplate.update({where:{key:RESPONSE_TEMPLATE_KEY},data:{body:'Administrator wording {{responseUrl}}',isActive:false}});migrate();migrate();
 const t=await prisma.notificationTemplate.findUniqueOrThrow({where:{key:RESPONSE_TEMPLATE_KEY}});assert.equal(t.isActive,false);assert.match(t.body,/Administrator/);
 const p=await target();assert.equal((await queue(p.id)).ok,false);
});
test('native sources and scanner-safe response route remain wired correctly',()=>{
 const page=readFileSync('src/app/(public)/player-pool/profile/[token]/respond/page.tsx','utf8');assert.match(page,/form action=\{declinePlayerPoolAction\}/);assert.doesNotMatch(page,/closeAwaitingPlayerPoolProfile\(/);
 const processor=readFileSync('src/lib/notifications/processor.ts','utf8');assert.equal((processor.match(/await getPlayerPoolResponseDeliveryBlock\(dispatch\)/g)||[]).length,2);
});
