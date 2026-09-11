import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomUUID, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { prisma } from "../src/lib/prisma";
import { getLeagueStandings } from "../src/lib/standings";
import { previewResultOverturn, confirmResultOverturn, getResultOverturnPage } from "../src/lib/results/overturn-result";
import { getOnPitchResult, useOnPitchResults, type ResultScoreSnapshot } from "../src/lib/results/result-scores";
import { calculateFixtureWinChance, type WinChanceFixture } from "../src/lib/fixtures/winChance";
import { buildNameAwareWinChanceFixtures } from "../src/lib/fixtures/winChanceHistory";
import { calculatePredictorV3Candidates } from "../src/lib/fixtures/predictorV3Candidate";
import { getReportSource } from "../src/lib/matchweek-reports/facts";

const database = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_RESULT_OVERTURN_TEST === "1" && database.hostname === "127.0.0.1" && database.pathname === "/sixfl_result_overturn_test", "Disposable local database only");
globalThis.fetch = async () => { throw new Error("No external services are permitted in overturn tests"); };
const migration = "prisma/migrations/20260912010000_record_overturned_results/migration.sql";
const migrate = (path: string) => execFileSync("psql", [process.env.DATABASE_URL!, "-v", "ON_ERROR_STOP=1", "-f", path], { stdio: "pipe" });
let oldFixtureId: string;
before(async () => {
  migrate("prisma/migrations/20260702182000_season_team_entries/migration.sql");
  migrate("prisma/migrations/20260819232000_fixture_abandonment_workflow/migration.sql");
  await prisma.$executeRaw`ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "isFixturePlaceholder" BOOLEAN NOT NULL DEFAULT false`;
  // Insert a legacy match without selecting the as-yet-unmigrated columns.
  const id=randomUUID();
  const league=await prisma.league.create({data:{name:"Before migration",slug:id}});
  const a=await prisma.team.create({data:{name:"Original A",claimCode:id,leagueId:league.id}});
  const b=await prisma.team.create({data:{name:"Original B",claimCode:id+"b",leagueId:league.id}});
  const f=await prisma.fixture.create({data:{leagueId:league.id,homeTeamId:a.id,awayTeamId:b.id,kickoffAt:new Date("2026-09-09T19:00:00Z"),publishedAt:new Date("2026-09-01T12:00:00Z"),status:"COMPLETED"}});oldFixtureId=f.id;
  await prisma.$executeRaw`INSERT INTO "MatchResult" (id,"fixtureId","homeScore","awayScore","enteredAt","createdAt","updatedAt") VALUES (${id},${f.id},4,1,NOW(),NOW(),NOW())`;
  migrate(migration);
});
after(async()=>{await prisma.$disconnect();});
async function target(homeScore=4,awayScore=1,status:"COMPLETED"|"SCHEDULED"="COMPLETED") {
  const id=randomUUID();
  const league=await prisma.league.create({data:{name:`Overturn test ${id}`,slug:id,season:"Test",isActive:true}});
  const home=await prisma.team.create({data:{name:"Test team A",claimCode:id,leagueId:league.id}});
  const away=await prisma.team.create({data:{name:"Test team B",claimCode:id+"b",leagueId:league.id}});
  const admin=await prisma.user.create({data:{name:"Test administrator",email:id+"@example.invalid",role:"ADMIN"}});
  const fixture=await prisma.fixture.create({data:{leagueId:league.id,homeTeamId:home.id,awayTeamId:away.id,kickoffAt:new Date("2026-09-09T19:00:00Z"),publishedAt:new Date("2026-09-01T12:00:00Z"),status}});
  const result=await prisma.matchResult.create({data:{fixtureId:fixture.id,homeScore,awayScore,enteredByUserId:admin.id,enteredAt:new Date("2026-09-09T20:00:00Z")}});
  return {league,home,away,admin,fixture,result};
}
type Target=Awaited<ReturnType<typeof target>>;
const preview=(t:Target,winner=t.away.id)=>previewResultOverturn({fixtureId:t.fixture.id,actorUserId:t.admin.id,winnerTeamId:winner,reasonCode:"PLAYER_LIMIT",decisionReason:"Reviewed evidence establishes a participation-limit breach.",evidenceReference:"Private reviewed evidence reference TEST-1",rulesBasis:"Test rules version applicable to the fixture, sections 4, 8, 14"});
const confirm=(t:Target,token:string)=>confirmResultOverturn({fixtureId:t.fixture.id,actorUserId:t.admin.id,token,confirmed:true});
const result=(t:Target)=>prisma.matchResult.findUniqueOrThrow({where:{id:t.result.id}});
const counter=async()=>Promise.all([prisma.paymentCharge.count(),prisma.paymentTransaction.count(),prisma.notificationDispatch.count()]);

test("migration keeps old scores unchanged, with no reconstructed overturns",async()=>{
  const r=await prisma.matchResult.findUniqueOrThrow({where:{fixtureId:oldFixtureId}});
  assert.deepEqual([r.homeScore,r.awayScore,r.overturnedAt,r.originalHomeScore,r.originalAwayScore],[4,1,null,null,null]);
  assert.equal(await prisma.matchResultOverturn.count(),0);
});
test("read and signed preview have no writes; confirmation preserves playing score and entry provenance",async()=>{
  const t=await target(),before=await counter();
  await prisma.matchResultTeamMeta.create({data:{matchResultId:t.result.id,teamId:t.home.id,goalsRecorded:4,scorers:[{name:"Test scorer",goals:4}],playerOfMatchName:"Test scorer"}});
  const meta=await prisma.matchResultTeamMeta.findMany({where:{matchResultId:t.result.id}});
  assert.equal((await getResultOverturnPage(t.fixture.id,t.admin.id)).decision,null);
  const p=await preview(t);
  assert.deepEqual(p.original,{homeScore:4,awayScore:1});assert.deepEqual(p.awarded,{homeScore:0,awayScore:3});
  assert.deepEqual(await result(t),t.result);
  assert.equal(await prisma.matchResultOverturn.count({where:{fixtureId:t.fixture.id}}),0);
  const saved=await confirm(t,p.token);assert.equal(saved.alreadySaved,false);
  const r=await result(t);assert.deepEqual([r.homeScore,r.awayScore,r.originalHomeScore,r.originalAwayScore],[0,3,4,1]);
  assert.equal(r.enteredAt.getTime(),t.result.enteredAt.getTime());assert.equal(r.enteredByUserId,t.admin.id);
  assert.deepEqual(getOnPitchResult(r),{homeScore:4,awayScore:1});
  const page=await getResultOverturnPage(t.fixture.id,t.admin.id);
  assert.equal(page.decision?.decidedByUserId,t.admin.id);assert.equal(page.decision?.decidedAt.getTime(),r.overturnedAt?.getTime());
  assert.match(page.decision!.evidenceReference,/TEST-1/);
  assert.deepEqual(await prisma.matchResultTeamMeta.findMany({where:{matchResultId:t.result.id}}),meta);
  assert.deepEqual(await counter(),before,"No charges, receipts or messages created");
  assert.equal((await confirm(t,p.token)).alreadySaved,true);
  assert.equal(await prisma.matchResultOverturn.count({where:{fixtureId:t.fixture.id}}),1);
});
test("central standings use awarded win, goals and form; predictor still sees on-pitch loss",async()=>{
  const t=await target(),p=await preview(t);await confirm(t,p.token);
  const table=await getLeagueStandings(t.league.id),a=table.rows.find(r=>r.teamId===t.home.id)!,b=table.rows.find(r=>r.teamId===t.away.id)!;
  assert.deepEqual([a.points,a.goalsFor,a.goalsAgainst,a.recentForm],[0,0,3,["L"]]);
  assert.deepEqual([b.points,b.goalsFor,b.goalsAgainst,b.recentForm],[3,3,0,["W"]]);
  assert.deepEqual(getOnPitchResult(await result(t)),{homeScore:4,awayScore:1});
});
test("both team orientations preserve genuine zero scores",async()=>{
  const t=await target(0,4),p=await preview(t,t.home.id);await confirm(t,p.token);
  const r=await result(t);assert.deepEqual([r.homeScore,r.awayScore],[3,0]);assert.deepEqual(getOnPitchResult(r),{homeScore:0,awayScore:4});
});
test("concurrent identical confirmations are idempotent; distinct decisions cannot overwrite",async()=>{
  const t=await target(),p=await preview(t),q=await preview(t,t.home.id);
  const results=await Promise.all([confirm(t,p.token),confirm(t,p.token)]);
  assert.deepEqual(results.map(r=>r.alreadySaved).sort(),[false,true]);
  await assert.rejects(confirm(t,q.token),/already been saved/);
  assert.equal(await prisma.matchResultOverturn.count({where:{fixtureId:t.fixture.id}}),1);
});
test("raw SQL, referee-style upserts and deletion cannot silently erase originals or award",async()=>{
  const t=await target(),p=await preview(t);await confirm(t,p.token);
  await assert.rejects(prisma.matchResult.update({where:{id:t.result.id},data:{homeScore:4,awayScore:1}}),/overturned/);
  await assert.rejects(prisma.matchResult.upsert({where:{fixtureId:t.fixture.id},create:{fixtureId:t.fixture.id,homeScore:1,awayScore:0},update:{homeScore:1,awayScore:0}}),/overturned/);
  await assert.rejects(prisma.$executeRaw`UPDATE "MatchResult" SET "originalHomeScore"=9 WHERE id=${t.result.id}`,/overturned/);
  await assert.rejects(prisma.$executeRaw`UPDATE "MatchResult" SET "enteredAt"=NOW() WHERE id=${t.result.id}`,/provenance/);
  await assert.rejects(prisma.matchResult.delete({where:{id:t.result.id}}),/cannot be deleted/);
  await assert.rejects(prisma.matchResultOverturn.deleteMany({where:{fixtureId:t.fixture.id}}),/immutable/);
  await assert.rejects(prisma.$executeRaw`UPDATE "Fixture" SET status='SCHEDULED' WHERE id=${t.fixture.id}`,/reassigned or reopened/);
  await assert.rejects(prisma.$executeRaw`DELETE FROM "Fixture" WHERE id=${t.fixture.id}`,/decision history/);
  // Closing a separately reviewed dispute must remain possible.
  await prisma.matchResult.update({where:{id:t.result.id},data:{isDisputed:false}});
  assert.deepEqual(getOnPitchResult(await result(t)),{homeScore:4,awayScore:1});
});
test("stale preview, forged token, swapped fixture, missing confirmation and non-admin fail closed",async()=>{
  const t=await target(),p=await preview(t),other=await target();
  await assert.rejects(confirm(t,p.token+"bad"),/preview/);
  await assert.rejects(confirm(other,p.token),/another administrator or fixture/);
  await assert.rejects(confirmResultOverturn({fixtureId:t.fixture.id,actorUserId:t.admin.id,token:p.token,confirmed:false}),/Confirm/);
  await prisma.matchResult.update({where:{id:t.result.id},data:{homeScore:5}});
  await assert.rejects(confirm(t,p.token),/changed after preview/);
  const [encoded]=p.token.split("."); const expiredData=JSON.parse(Buffer.from(encoded,"base64url").toString());expiredData.expiresAt=Date.now()-1;
  const expiredBody=Buffer.from(JSON.stringify(expiredData)).toString("base64url");
  await assert.rejects(confirm(t,`${expiredBody}.${createHmac("sha256",process.env.NEXTAUTH_SECRET!).update(expiredBody).digest("base64url")}`),/expired/);
  const next=await preview(t);await prisma.user.update({where:{id:t.admin.id},data:{role:"USER"}});
  await assert.rejects(confirm(t,next.token),/Administrator/);
  assert.equal(await prisma.matchResultOverturn.count({where:{fixtureId:t.fixture.id}}),0);
});
test("abandonments, no-shows, scheduled games, invalid winners and fabricated markers are not ordinary overturns",async()=>{
  const t=await target();
  await prisma.$executeRaw`INSERT INTO "FixtureAbandonment" (id,"fixtureId",reason) VALUES (${randomUUID()},${t.fixture.id},'TEST_NO_SHOW')`;
  await assert.rejects(preview(t),/abandonment or no-show/);
  await assert.rejects(preview(await target(4,1,"SCHEDULED")),/completed fixtures/);
  const normal=await target();await assert.rejects(preview(normal,"another-team"),/fixture's teams/);
  await assert.rejects(prisma.matchResult.update({where:{id:normal.result.id},data:{overturnedAt:new Date(),originalHomeScore:4,originalAwayScore:1}}),/audited overturn/);
});
test("new automated articles flag overturned games for editorial review, never narrate an awarded score",async()=>{
  const t=await target(),p=await preview(t);await confirm(t,p.token);
  const source=await getReportSource(t.league.slug,"2026-09-09");assert.ok(source);
  assert.equal(source.matches.length,0);assert.ok(source.skippedFixtures?.[0].reasons.some(r=>r.code==="result_overturned"));
});
test("re-running the additive migration does not revise existing decisions or scores",async()=>{
  const count=await prisma.matchResultOverturn.count(),rows=await prisma.matchResult.findMany({where:{overturnedAt:{not:null}},orderBy:{id:"asc"}});
  migrate(migration);assert.equal(await prisma.matchResultOverturn.count(),count);
  assert.deepEqual(await prisma.matchResult.findMany({where:{overturnedAt:{not:null}},orderBy:{id:"asc"}}),rows);
});

const history=(result:ResultScoreSnapshot):WinChanceFixture[]=>[
 {kickoffAt:"2026-09-09T19:00:00Z",status:"COMPLETED",homeTeam:{id:"a"},awayTeam:{id:"b"},result},
 {kickoffAt:"2026-09-02T19:00:00Z",status:"COMPLETED",homeTeam:{id:"a"},awayTeam:{id:"c"},result:{homeScore:5,awayScore:2}},
 {kickoffAt:"2026-09-02T19:40:00Z",status:"COMPLETED",homeTeam:{id:"c"},awayTeam:{id:"b"},result:{homeScore:2,awayScore:3}},
];
test("V2, V3, name-aware history, Elo, head-to-head and scoring models are invariant to an administrative award",()=>{
 const before=history({homeScore:4,awayScore:1}),after=history({homeScore:0,awayScore:3,originalHomeScore:4,originalAwayScore:1,overturnedAt:"2026-09-12T12:00:00Z"});
 const snapshot=JSON.stringify(after);
 for(const [homeTeamId,awayTeamId] of [["a","b"],["b","a"],["b","c"]]) {
   const call=(fixtures:WinChanceFixture[])=>calculateFixtureWinChance({homeTeamId,awayTeamId,fixtures});
   assert.deepEqual(call(after),call(before));
   const v3=(h:WinChanceFixture[])=>calculatePredictorV3Candidates({homeTeamId,awayTeamId,history:h,currentProbabilities:{home:0.4,draw:0.2,away:0.4}});
   assert.deepEqual(v3(after),v3(before));
 }
 const mapped=buildNameAwareWinChanceFixtures({historyFixtures:after.map(f=>({...f,homeTeam:{...f.homeTeam,name:f.homeTeam.id},awayTeam:{...f.awayTeam,name:f.awayTeam.id}})),targetFixtures:[]});
 assert.deepEqual(mapped[0].result,{homeScore:4,awayScore:1});assert.equal(JSON.stringify(after),snapshot);
 assert.deepEqual(useOnPitchResults(after)[0].result,{homeScore:4,awayScore:1});
});
test("ordinary 3–0 remains a playing score; incomplete marked originals never fall back to awards",()=>{
 assert.deepEqual(getOnPitchResult({homeScore:3,awayScore:0}),{homeScore:3,awayScore:0});
 assert.equal(getOnPitchResult({homeScore:3,awayScore:0,overturnedAt:new Date()}),null);
 assert.equal(getOnPitchResult(null),null);
 assert.equal(getOnPitchResult({homeScore:3,awayScore:0,originalHomeScore:-1,originalAwayScore:1,overturnedAt:new Date()}),null);
});
