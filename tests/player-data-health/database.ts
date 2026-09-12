import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { prisma } from "../../src/lib/prisma";
import { ensurePlayerPoolTables } from "../../src/lib/player-pool/storage";
import { getPlayerRecruitmentMatches, matchRecruitmentRecords, type RecruitmentRecord, type SquadIdentity } from "../../src/lib/players/player-data-health-matches";
import { reconcileRecruitmentMatch, confirmRecruitmentIdentity } from "../../src/lib/players/player-data-health-reconcile";
import { runSafePlayerDataHealthCleanup } from "../../src/lib/players/player-data-health-safe";
import { getPlayerPoolContactHistory, playerPoolContactBlock } from "../../src/lib/player-pool/contact-history";
import { getPlayerPoolResponseDeliveryBlock } from "../../src/lib/player-pool/response-check";
import { ensurePlayerDataHealthChangeTable } from "../../src/lib/players/player-data-health-audit";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_DATA_HEALTH_TEST === '1' && url.hostname === '127.0.0.1' && url.pathname === '/sixfl_data_health_test', 'Disposable test database only');
global.fetch = async () => { throw new Error('External access disabled'); };
let adminId: string;
let seq = 400;
before(async () => {
  execFileSync('psql', [process.env.DATABASE_URL!, '-v','ON_ERROR_STOP=1','-f','prisma/migrations/20260424162000_add_team_member_profile/migration.sql'], {stdio:'pipe'});
  await prisma.$executeRawUnsafe(`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "squadStatus" TEXT NOT NULL DEFAULT 'ACTIVE'`);
  await ensurePlayerPoolTables(); await ensurePlayerDataHealthChangeTable();
  adminId = (await prisma.user.create({data:{name:'Test Admin',role:'ADMIN',email:'admin@example.invalid'}})).id;
});
after(async () => { await prisma.$disconnect(); });
async function pair(options: {differentEmail?: boolean; linked?: boolean; differentName?: boolean; inactive?: boolean; stop?: boolean; otherTeam?: boolean} = {}) {
  const code=randomUUID(); const name=`Test ${code.replaceAll('-','')}`; const phone=`07700900${++seq}`;
  const team=await prisma.team.create({data:{name:'Test team '+code,claimCode:code}});
  const user=await prisma.user.create({data:{name: options.differentName ? 'Different '+code : name,email:code+'@example.invalid',emailVerified:new Date()}});
  const member=await prisma.teamMember.create({data:{teamId:team.id,userId:user.id,role:'PLAYER'}});
  const prospect=await prisma.teamPlayerProspect.create({data:{firstName:name.split(' ')[0],lastName:name.split(' ')[1],phone,
    email:(options.differentEmail ? 'other-' : '')+code+'@example.invalid',status:options.stop?'DECLINED':'NEW',teamId:options.otherTeam ? (await prisma.team.create({data:{name:'Other '+code,claimCode:randomUUID()}})).id : null}});
  await prisma.$executeRaw`INSERT INTO "TeamMemberProfile" (id,"teamMemberId","sourceProspectId",phone) VALUES (${randomUUID()},${member.id},${options.linked ? prospect.id : null},${'+44'+phone.slice(1)})`;
  if(options.inactive) await prisma.$executeRaw`UPDATE "TeamMember" SET "squadStatus"='INACTIVE' WHERE id=${member.id}`;
  const id=randomUUID();
  await prisma.$executeRaw`INSERT INTO "PlayerPoolProfile" (id,"prospectId","profileToken","publicCode","emailNormalized",status,"createdAt","updatedAt") VALUES (${id},${prospect.id},${id},${'PP-'+code.replaceAll('-','').toUpperCase()},${prospect.email!},'INVITED',NOW()-INTERVAL '5 days',NOW()-INTERVAL '5 days')`;
  return {team,user,member,prospect,id};
}
const find = async (t: Awaited<ReturnType<typeof pair>>) => (await getPlayerRecruitmentMatches()).find(m=>m.record.id===t.prospect.id)!;
const poolStatus = async (id: string) => (await prisma.$queryRaw<Array<{status:string}>>`SELECT status FROM "PlayerPoolProfile" WHERE id=${id}`)[0].status;
const apply = async (t: Awaited<ReturnType<typeof pair>>) => reconcileRecruitmentMatch({match:await find(t),runId:randomUUID()});

// Synthetic policy fixtures do not assert anything about a real user's records.
test('normalisation, direct links, full-name hints and ambiguity remain separate', () => {
  const record: RecruitmentRecord={kind:'PROSPECT',id:'p',name:'Alex Example',email:'old@example.invalid',phone:'0044 (0)7700 900123',status:'NEW',teamId:null,teamName:null,profileId:'pool',publicCode:'PP-TEST',profileStatus:'INVITED',updatedAt:new Date(0),profileUpdatedAt:new Date(0)};
  const member: SquadIdentity={membershipId:'m',userId:'u',name:'Alex Example',email:'new@example.invalid',emailVerified:new Date(0),phone:'+447700900123',sourceProspectId:null,teamId:'t',teamName:'Team'};
  let result=matchRecruitmentRecords([record],[member])[0];assert.equal(result.safe,false);assert.ok(result.candidates[0].evidence.includes('Same normalised mobile'));
  result=matchRecruitmentRecords([record],[{...member,sourceProspectId:'p'}])[0];assert.equal(result.safe,true,'direct source link works across different emails');
  result=matchRecruitmentRecords([record],[{...member,sourceProspectId:'p',name:'Someone Else'}])[0];assert.equal(result.safe,false);
  result=matchRecruitmentRecords([record],[{...member,sourceProspectId:'p'},{...member,userId:'u2',membershipId:'m2'}])[0];assert.equal(result.safe,false);assert.equal(result.candidates.length,2);
  result=matchRecruitmentRecords([{...record,name:'A Example',phone:null}],[member])[0];assert.equal(result.safe,false);assert.match(result.candidates[0].evidence.join(),/Similar name/);
  assert.equal(matchRecruitmentRecords([{...record,name:'Alex',phone:null}],[{...member,name:'Alex'}])[0].candidates.length,0,'single given names never identify people');
});
test('read-only scan finds phone/name different-email records and does not alter them', async()=>{
  const t=await pair({differentEmail:true});const before=await prisma.teamPlayerProspect.findUnique({where:{id:t.prospect.id}});
  const match=await find(t);assert.equal(match.safe,false);assert.equal(match.candidates[0].userId,t.user.id);
  const h=(await getPlayerPoolContactHistory([t.id])).get(t.id)!;assert.match(playerPoolContactBlock(h,'EMAIL')!,/Possible existing player/);assert.match(playerPoolContactBlock(h,'SMS')!,/Review Player data health/);
  assert.deepEqual(await prisma.teamPlayerProspect.findUnique({where:{id:t.prospect.id}}),before);assert.equal(await poolStatus(t.id),'INVITED');
});
test('safe linked record with changed email is reconciled atomically without touching the account',async()=>{
  const t=await pair({differentEmail:true,linked:true});assert.equal((await find(t)).safe,true);
  const account=await prisma.user.findUnique({where:{id:t.user.id}});const member=await prisma.teamMember.findUnique({where:{id:t.member.id}});
  const result=await apply(t);assert.equal(result.playerPoolProfilesJoined,1);assert.equal(await poolStatus(t.id),'JOINED');
  assert.equal((await prisma.teamPlayerProspect.findUniqueOrThrow({where:{id:t.prospect.id}})).status,'DUPLICATE');
  assert.deepEqual(await prisma.user.findUnique({where:{id:t.user.id}}),account);assert.deepEqual(await prisma.teamMember.findUnique({where:{id:t.member.id}}),member);
  assert.equal((await getPlayerRecruitmentMatches()).some(m=>m.record.id===t.prospect.id),false,'resolved rows no longer reported');
});
test('verified email plus full name remains safe; shared email/name conflicts do not',async()=>{
  const t=await pair();assert.equal((await find(t)).safe,true);
  const conflict=await pair({differentName:true});assert.equal((await find(conflict)).safe,false);assert.equal((await apply(conflict)).changed,false);
});
test('multiple memberships on one account are not treated as duplicate identities',async()=>{
  const t=await pair();const second=await prisma.team.create({data:{name:'Second '+randomUUID(),claimCode:randomUUID()}});
  await prisma.teamMember.create({data:{userId:t.user.id,teamId:second.id,role:'PLAYER'}});
  const m=await find(t);assert.equal(m.candidates.length,1);assert.equal(m.candidates[0].teams.length,2);assert.equal(m.safe,true);
});
test('inactive former squad members and explicit stopped enquiries are not bulk cleaned',async()=>{
  const t=await pair({inactive:true});assert.equal(await find(t),undefined);
  const h=(await getPlayerPoolContactHistory([t.id])).get(t.id)!;assert.equal(h.hasMembership,false);assert.equal(h.squadMatch,undefined);
  const stopped=await pair({stop:true});assert.equal((await find(stopped)).safe,false);assert.equal((await apply(stopped)).changed,false);
});
test('different-team prospect is preserved even after explicit verification of its pool overlap',async()=>{
  const t=await pair({otherTeam:true});const m=await find(t);assert.equal(m.safe,false);assert.match(m.reason,/different team/);
  const result=await confirmRecruitmentIdentity({kind:'PROSPECT',recordId:t.prospect.id,fingerprint:m.fingerprint,userId:t.user.id,actorUserId:adminId,reason:'Test person verified directly'});
  assert.equal(result.playerPoolProfilesJoined,1);assert.equal((await prisma.teamPlayerProspect.findUniqueOrThrow({where:{id:t.prospect.id}})).status,'NEW');
});
test('an admin can resolve a verified possible match; stale/unauthorised/short-note submissions cannot',async()=>{
  const t=await pair({differentEmail:true});const m=await find(t);const input={kind:'PROSPECT',recordId:t.prospect.id,fingerprint:m.fingerprint,userId:t.user.id,actorUserId:adminId,reason:'Verified both records by direct conversation'};
  await assert.rejects(confirmRecruitmentIdentity({...input,actorUserId:t.user.id}),/Administrator/);
  await assert.rejects(confirmRecruitmentIdentity({...input,reason:'x'}),/verified/);
  assert.equal(await poolStatus(t.id),'INVITED');
  await confirmRecruitmentIdentity(input);assert.equal(await poolStatus(t.id),'JOINED');
  const rows=await prisma.$queryRaw<Array<{reason:string}>>`SELECT reason FROM "PlayerDataHealthChange" WHERE "recordId"=${t.id}`;assert.match(rows[0].reason,new RegExp(adminId));assert.match(rows[0].reason,/direct conversation/);
  await assert.rejects(confirmRecruitmentIdentity(input),/changed|resolved/);
  const stale=await pair({differentEmail:true});const s=await find(stale);await prisma.user.update({where:{id:stale.user.id},data:{name:'Changed identity'}});
  await assert.rejects(confirmRecruitmentIdentity({...input,recordId:stale.prospect.id,fingerprint:s.fingerprint,userId:stale.user.id}),/changed/);assert.equal(await poolStatus(stale.id),'INVITED');
});
test('cleanup cancels only unsent owned chases and preserves sent messages, replies and other sources',async()=>{
  const t=await pair({linked:true});const r=await prisma.notificationRecipient.create({data:{sourceType:'GENERAL',sourceId:randomUUID(),audience:'PLAYER'}});
  const make=(sourceType:string,status:'QUEUED'|'SENT'='QUEUED',providerMessageId:string|null=null)=>prisma.notificationDispatch.create({data:{recipientId:r.id,channel:'EMAIL',audience:'PLAYER',sourceId:t.id,sourceType,status,bodyText:'immutable',providerMessageId,sentAt:status==='SENT'?new Date():null}});
  const queued=await make('PLAYER_POOL_PROFILE_NUDGE');const sent=await make('PLAYER_POOL_PROFILE_NUDGE','SENT','accepted');const accepted=await make('PLAYER_POOL_PROFILE_NUDGE','QUEUED','already-accepted');const other=await make('OTHER');
  await apply(t);
  assert.equal((await prisma.notificationDispatch.findUniqueOrThrow({where:{id:queued.id}})).status,'CANCELLED');
  for(const d of [sent,accepted,other]) assert.deepEqual(await prisma.notificationDispatch.findUnique({where:{id:d.id}}),d);
});
test('an existing queued email is blocked when a different-email phone match appears',async()=>{
  const t=await pair({differentEmail:true});assert.ok(await getPlayerPoolResponseDeliveryBlock({id:'test-dispatch',sourceType:'PLAYER_POOL_PROFILE_NUDGE',sourceId:t.id,channel:'EMAIL',createdAt:new Date(),recipient:{email:t.prospect.email},variables:{profileUrl:'unused'}}));
});
test('audit failure rolls back all changes for the recruitment record',async()=>{
  const t=await pair({linked:true});await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_health_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated audit failure'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_health_audit BEFORE INSERT ON "PlayerDataHealthChange" FOR EACH ROW EXECUTE FUNCTION test_reject_health_audit()`);
  try{await assert.rejects(apply(t),/isolated audit failure/);assert.equal(await poolStatus(t.id),'INVITED');assert.equal((await prisma.teamPlayerProspect.findUniqueOrThrow({where:{id:t.prospect.id}})).status,'NEW');}
  finally{await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_health_audit ON "PlayerDataHealthChange"');await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_health_audit()');}
});
test('concurrent cleanup cannot apply duplicate changes',async()=>{
  const t=await pair({linked:true});const match=await find(t);await Promise.allSettled([1,2,3].map(()=>reconcileRecruitmentMatch({match,runId:randomUUID()})));
  assert.equal(await poolStatus(t.id),'JOINED');const rows=await prisma.$queryRaw<Array<{count:number}>>`SELECT COUNT(*)::int AS count FROM "PlayerDataHealthChange" WHERE "recordId"=${t.id}`;assert.equal(rows[0].count,1);
});
test('bulk safe cleanup leaves possible matches unchanged and retains an itemised run',async()=>{
  const t=await pair({differentEmail:true});const direct=await pair({differentEmail:true,linked:true});
  const result=await runSafePlayerDataHealthCleanup({source:'MANUAL',force:true,actorUserId:adminId});assert.ok(result.affectedUsers>0);
  assert.equal(await poolStatus(t.id),'INVITED');assert.equal(await poolStatus(direct.id),'JOINED');
});
