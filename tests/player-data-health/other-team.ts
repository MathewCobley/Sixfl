import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { ensurePlayerPoolTables } from "../../src/lib/player-pool/storage";
import { getPlayerRecruitmentMatches } from "../../src/lib/players/player-data-health-matches";
import { confirmRecruitmentIdentity, reconcileRecruitmentMatch } from "../../src/lib/players/player-data-health-reconcile";
import { runSafePlayerDataHealthCleanup } from "../../src/lib/players/player-data-health-safe";

// Run only after the existing data-health tests, against their disposable CI DB.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_DATA_HEALTH_TEST === "1" && url.hostname === "127.0.0.1" && url.pathname === "/sixfl_data_health_test", "Disposable local database only");
global.fetch = async () => { throw new Error("External requests disabled"); };
let adminId: string;
let phoneIndex = 800;
before(async () => {
  await ensurePlayerPoolTables();
  adminId = (await prisma.user.create({data:{name:"Test administrator",email:randomUUID()+"@example.invalid",role:"ADMIN"}})).id;
});
after(async () => { await prisma.$disconnect(); });
async function fixture(withPool = false) {
  const key = randomUUID();
  const teams = await Promise.all(["First current squad", "Second current squad", "Old recruitment squad"].map(label => prisma.team.create({data:{name:label+" "+key,claimCode:randomUUID()}})));
  const user = await prisma.user.create({data:{name:"Alex "+key,email:key+"@example.invalid",emailVerified:new Date()}});
  const phone = "07700900" + (++phoneIndex);
  const members = await Promise.all(teams.slice(0,2).map(team => prisma.teamMember.create({data:{teamId:team.id,userId:user.id,role:"PLAYER"}})));
  for (const member of members) await prisma.$executeRaw`INSERT INTO "TeamMemberProfile" (id,"teamMemberId",phone) VALUES (${randomUUID()},${member.id},${"+44"+phone.slice(1)})`;
  const prospect = await prisma.teamPlayerProspect.create({data:{teamId:teams[2].id,firstName:"Alex",lastName:key,email:"old-"+key+"@example.invalid",phone,status:"CONTACTED",notes:"Original recruitment note"}});
  let profileId: string | null = null;
  if (withPool) {
    profileId = randomUUID();
    await prisma.$executeRaw`INSERT INTO "PlayerPoolProfile" (id,"prospectId","profileToken","publicCode","emailNormalized",status,"createdAt","updatedAt") VALUES (${profileId},${prospect.id},${profileId},${"PP-"+key.replaceAll("-", "").toUpperCase()},${prospect.email!},'INVITED',NOW(),NOW())`;
  }
  return {user,teams,members,prospect,profileId};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const matchFor = async (f: Fixture) => (await getPlayerRecruitmentMatches()).find(m => m.record.id === f.prospect.id)!;
const prospectFor = (f: Fixture) => prisma.teamPlayerProspect.findUniqueOrThrow({where:{id:f.prospect.id}});
const membershipSnapshot = (f: Fixture) => prisma.$queryRaw`SELECT to_jsonb(m) AS member, to_jsonb(p) AS profile FROM "TeamMember" m LEFT JOIN "TeamMemberProfile" p ON p."teamMemberId"=m.id WHERE m."userId"=${f.user.id} ORDER BY m.id`;
async function inputFor(f: Fixture) {
  return {kind:"PROSPECT",recordId:f.prospect.id,fingerprint:(await matchFor(f)).fingerprint,userId:f.user.id,actorUserId:adminId,
    reason:"Verified existing player; this other-team recruitment enquiry is obsolete.",closeOtherTeamEnquiryId:f.teams[2].id};
}

test("default confirmation preserves the other-team prospect", async () => {
  const f = await fixture();
  const {closeOtherTeamEnquiryId: _unused, ...input} = await inputFor(f);
  assert.equal((await confirmRecruitmentIdentity(input)).changed, false);
  assert.deepEqual(await prospectFor(f), f.prospect);
  assert.equal((await matchFor(f)).safe, false);
});

test("explicit prospect-only closure preserves both existing squads, account and historical enquiry details", async () => {
  const f = await fixture();
  const memberships = await membershipSnapshot(f);
  const account = await prisma.user.findUnique({where:{id:f.user.id}});
  const result = await confirmRecruitmentIdentity(await inputFor(f));
  assert.equal(result.prospectsClosedAsDuplicate, 1); assert.equal(result.prospectsActivated, 0);
  const closed = await prospectFor(f);
  assert.equal(closed.status, "DUPLICATE");
  assert.equal(closed.teamId, f.teams[2].id);
  assert.equal(closed.email, f.prospect.email); assert.equal(closed.phone, f.prospect.phone);
  assert.ok(closed.notes?.startsWith("Original recruitment note")); assert.ok(closed.notes?.includes(f.user.id));
  assert.deepEqual(await membershipSnapshot(f), memberships);
  assert.deepEqual(await prisma.user.findUnique({where:{id:f.user.id}}), account);
  assert.equal(await prisma.teamMember.count({where:{teamId:f.teams[2].id,userId:f.user.id}}), 0);
  assert.equal(await matchFor(f), undefined);
  const audit = await prisma.$queryRaw<Array<{userId:string;teamNames:string;previousStatus:string;newStatus:string;reason:string}>>`SELECT "userId","teamNames","previousStatus","newStatus",reason FROM "PlayerDataHealthChange" WHERE "recordId"=${f.prospect.id}`;
  assert.equal(audit.length,1); assert.equal(audit[0].userId,f.user.id);
  assert.equal(audit[0].previousStatus,"CONTACTED"); assert.equal(audit[0].newStatus,"DUPLICATE");
  for (const team of f.teams.slice(0,2)) assert.ok(audit[0].teamNames.includes(team.name));
  assert.ok(audit[0].reason.includes(f.teams[2].name)); assert.ok(audit[0].reason.includes(adminId));
});

test("bulk cleanup cannot close an other-team enquiry", async () => {
  const f = await fixture();
  await runSafePlayerDataHealthCleanup({source:"MANUAL",force:true,actorUserId:adminId});
  assert.deepEqual(await prospectFor(f), f.prospect);
});

test("wrong team, unauthorised actor, stopped status and stale evidence are rejected", async () => {
  const f = await fixture(); const input = await inputFor(f);
  await assert.rejects(confirmRecruitmentIdentity({...input,actorUserId:f.user.id}),/Administrator/);
  await assert.rejects(confirmRecruitmentIdentity({...input,closeOtherTeamEnquiryId:f.teams[0].id}),/enquiry team/);
  assert.deepEqual(await prospectFor(f),f.prospect);
  await prisma.teamPlayerProspect.update({where:{id:f.prospect.id},data:{notes:"Changed since preview"}});
  await assert.rejects(confirmRecruitmentIdentity(input),/changed/);
  const stopped = await fixture(true);
  await prisma.teamPlayerProspect.update({where:{id:stopped.prospect.id},data:{status:"DECLINED"}});
  await assert.rejects(confirmRecruitmentIdentity(await inputFor(stopped)),/Only an open/);
  assert.equal((await prospectFor(stopped)).status,"DECLINED");
});

test("the control refuses to close a current-squad enquiry", async () => {
  const f = await fixture(); const stale = await inputFor(f);
  await prisma.teamMember.create({data:{userId:f.user.id,teamId:f.teams[2].id,role:"PLAYER"}});
  await assert.rejects(confirmRecruitmentIdentity(stale),/changed/);
  await assert.rejects(confirmRecruitmentIdentity(await inputFor(f)),/current squad/);
  assert.equal((await prospectFor(f)).status,"CONTACTED");
  assert.equal(await prisma.teamMember.count({where:{userId:f.user.id}}),3);
});

test("only queued messages owned by the obsolete prospect are cancelled; provider evidence is immutable", async () => {
  const f = await fixture();
  const recipient = await prisma.notificationRecipient.create({data:{sourceType:"GENERAL",sourceId:randomUUID(),audience:"PLAYER"}});
  const make = (sourceType:string, sourceId=f.prospect.id, status:"QUEUED"|"SENT"|"PROCESSING"="QUEUED", providerMessageId:string|null=null) => prisma.notificationDispatch.create({data:{recipientId:recipient.id,channel:"EMAIL",audience:"PLAYER",sourceType,sourceId,status,providerMessageId,bodyText:"Existing saved text",sentAt:status==="SENT"?new Date():null}});
  const queued = await Promise.all(["TEAM_PLAYER_PROSPECT","MANAGED_SQUAD_JOIN_CONFIRMATION","MANAGED_SQUAD_JOIN_CHASE","MANAGED_SQUAD_JOIN_FINAL_CHASE","MANAGED_SQUAD_REGISTRATION_REMINDER"].map(source => make(source)));
  const preserved = await Promise.all([make("TEAM_PLAYER_PROSPECT",f.prospect.id,"SENT","provider-sent"),make("TEAM_PLAYER_PROSPECT",f.prospect.id,"QUEUED","provider-accepted"),make("TEAM_PLAYER_PROSPECT",f.prospect.id,"PROCESSING"),make("FIXTURE_MATCH_FEE"),make("TEAM_PLAYER_PROSPECT","another-prospect")]);
  await confirmRecruitmentIdentity(await inputFor(f));
  for (const d of queued) assert.equal((await prisma.notificationDispatch.findUniqueOrThrow({where:{id:d.id}})).status,"CANCELLED");
  for (const d of preserved) assert.deepEqual(await prisma.notificationDispatch.findUnique({where:{id:d.id}}),d);
});

test("only the named obsolete introduction is closed, not an unrelated other-team request", async () => {
  const f = await fixture(true);
  const fourth = await prisma.team.create({data:{name:"Independent enquiry "+randomUUID(),claimCode:randomUUID()}});
  const request = async (teamId:string) => {
    const id=randomUUID();
    await prisma.$executeRaw`INSERT INTO "PlayerPoolIntroductionRequest" (id,"profileId","teamId",status,"createdAt","updatedAt") VALUES (${id},${f.profileId},${teamId},'REQUESTED',NOW(),NOW())`;
    return id;
  };
  const old = await request(f.teams[2].id), unrelated = await request(fourth.id);
  const result=await confirmRecruitmentIdentity(await inputFor(f)); assert.equal(result.requestsClosed,1);
  const rows=await prisma.$queryRaw<Array<{id:string;status:string}>>`SELECT id,status FROM "PlayerPoolIntroductionRequest" WHERE id IN (${old},${unrelated})`;
  assert.equal(rows.find(r=>r.id===old)?.status,"CLOSED"); assert.equal(rows.find(r=>r.id===unrelated)?.status,"REQUESTED");
});

test("concurrent explicit confirmations cannot duplicate the closure audit", async () => {
  const f=await fixture(), match=await matchFor(f), input=await inputFor(f);
  await Promise.allSettled([1,2,3].map(()=>reconcileRecruitmentMatch({match,runId:randomUUID(),confirmation:{userId:f.user.id,actorUserId:adminId,reason:input.reason,closeOtherTeamEnquiryId:f.teams[2].id}})));
  assert.equal((await prospectFor(f)).status,"DUPLICATE");
  const rows=await prisma.$queryRaw<Array<{count:number}>>`SELECT COUNT(*)::int AS count FROM "PlayerDataHealthChange" WHERE "recordId"=${f.prospect.id}`;
  assert.equal(rows[0].count,1);
});
