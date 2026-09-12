import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { recordResultOverturn } from "../../src/lib/fixtures/result-overturn";
import { getResultOverturnEmailPanel, queueResultOverturnEmails, RESULT_OVERTURN_EMAIL_SOURCE } from "../../src/lib/fixtures/result-overturn-email";

const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.OVERTURN_TEST_DATABASE, "1");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.pathname, "/sixfl_overturn_test");
process.env.EMAIL_REPLY_DOMAIN = "replies.example.invalid";
// The real queue renderer/recipient lookup is used; outbound HTTP is forbidden.
globalThis.fetch = async () => { throw new Error("External HTTP forbidden in notice tests"); };
let count = 0;
const pass = (message: string) => console.log(`PASS email ${++count}: ${message}`);
async function main() {
  const admin = await prisma.user.findUniqueOrThrow({where:{email:"overturn-admin@example.invalid"}});
  const captain = await prisma.user.findUniqueOrThrow({where:{email:"overturn-captain@example.invalid"}});
  const fixture = await prisma.fixture.findFirstOrThrow({where:{result:{overturn:{isNot:null}}},include:{result:{include:{overturn:true}}}});
  const decision = fixture.result!.overturn!;
  const home = await prisma.team.update({where:{id:fixture.homeTeamId},data:{contactEmail:"HOME@example.invalid",contactName:"Home captain"}});
  const away = await prisma.team.update({where:{id:fixture.awayTeamId},data:{contactEmail:"away@example.invalid",contactName:"Away captain"}});
  const extra = await prisma.user.create({data:{email:"extra@example.invalid",name:"Additional captain"}});
  const primary = await prisma.user.create({data:{email:"home@example.invalid",name:"Same primary captain"}});
  for(const [teamId,userId]of [[home.id,extra.id],[away.id,extra.id],[home.id,primary.id]]) await prisma.teamMember.create({data:{teamId,userId,role:"CAPTAIN"}});
  const input = {fixtureId:fixture.id,decisionId:decision.id,actorUserId:admin.id,confirmed:true};
  const before = JSON.stringify(await prisma.matchResult.findUnique({where:{id:fixture.result!.id},include:{overturn:true}}));
  const cash = await prisma.paymentTransaction.count();
  const recipients = await prisma.notificationRecipient.count();
  const initial = await getResultOverturnEmailPanel(fixture.id,decision.id,admin.id);
  assert.equal(initial.records.length,0);assert.match(initial.body,/4–1/);assert.match(initial.body,/0–3/);
  assert.equal(await prisma.notificationRecipient.count(),recipients);assert.equal(await prisma.notificationDispatch.count(),0);
  pass("reading the preview sends nothing and does not create contacts");
  await assert.rejects(queueResultOverturnEmails({...input,actorUserId:captain.id}),/Administrator/);
  await assert.rejects(queueResultOverturnEmails({...input,confirmed:false}),/confirm/);
  await assert.rejects(queueResultOverturnEmails({...input,fixtureId:"wrong-fixture"}),/No recorded/);
  assert.equal(await prisma.notificationDispatch.count(),0);pass("permissions, confirmation and fixture/decision binding block unsafe sends");
  const concurrent = await Promise.all([queueResultOverturnEmails(input),queueResultOverturnEmails(input)]);
  assert.deepEqual(concurrent.map(r=>r.created).sort(),[0,3]);
  const dispatches = await prisma.notificationDispatch.findMany({where:{sourceType:RESULT_OVERTURN_EMAIL_SOURCE,sourceId:decision.id},include:{recipient:true}});
  assert.equal(dispatches.length,3);
  assert.deepEqual(dispatches.map(d=>d.recipient.email!.toLowerCase()).sort(),["away@example.invalid","extra@example.invalid","home@example.invalid"]);
  for(const d of dispatches){assert.equal(d.channel,"EMAIL");assert.equal(d.status,"QUEUED");assert.equal(d.createdByUserId,admin.id);assert.match(d.bodyText,/4–1/);assert.match(d.bodyText,/0–3/);assert.match(d.bodyHtml!,/default win for a rule breach/);assert.match(d.bodyHtml!,/View league results/);assert.ok(!JSON.stringify(d).includes(decision.evidenceNote));assert.ok(!JSON.stringify(d).includes(decision.rulesBasis));}
  assert.equal(new Set(dispatches.map(d=>d.bodyText)).size,1);pass("both primary contacts and additional captains get separate identical notices; duplicate addresses and concurrent clicks collapse");
  await prisma.notificationDispatch.update({where:{id:dispatches[0].id},data:{status:"FAILED"}});
  await prisma.notificationDispatch.update({where:{id:dispatches[1].id},data:{status:"SENT",sentAt:new Date()}});
  assert.equal((await queueResultOverturnEmails(input)).created,0);
  const panel = await getResultOverturnEmailPanel(fixture.id,decision.id,admin.id);
  assert.equal(panel.records.length,3);assert.ok(panel.records.some(d=>d.status==="FAILED"));assert.ok(panel.records.some(d=>d.status==="SENT"));pass("failed, sent and queued states remain visible; repeated requests do not silently resend");
  assert.equal(JSON.stringify(await prisma.matchResult.findUnique({where:{id:fixture.result!.id},include:{overturn:true}})),before);assert.equal(await prisma.paymentTransaction.count(),cash);pass("notifying never changes scores, decision history, predictor or cash");
  // A later fixture uses fresh notices; fail on the second row to prove atomic rollback.
  const next = await prisma.fixture.create({data:{leagueId:fixture.leagueId,homeTeamId:home.id,awayTeamId:away.id,status:"COMPLETED",kickoffAt:fixture.kickoffAt,publishedAt:fixture.publishedAt,result:{create:{homeScore:1,awayScore:4}}},include:{result:true}});
  const nextDecision = randomUUID();
  await recordResultOverturn({fixtureId:next.id,actorUserId:admin.id,requestId:nextDecision,winnerTeamId:home.id,reasonCode:"PLAYER_LIMIT",rulesBasis:"SECRET_RULE_BASIS_NOT_FOR_EMAIL",evidenceNote:"SECRET_PRIVATE_EVIDENCE_NOT_FOR_EMAIL",expectedResultUpdatedAt:next.result!.updatedAt.toISOString(),expectedHomeScore:1,expectedAwayScore:4,confirmed:true});
  await prisma.$executeRawUnsafe(`CREATE FUNCTION overturn_email_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sourceId"='${nextDecision}' AND NEW.metadata->>'emailNormalized'='away@example.invalid' THEN RAISE EXCEPTION 'deliberate notice rollback test'; END IF; RETURN NEW; END $$;`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER overturn_email_test_failure_trigger BEFORE INSERT ON "NotificationDispatch" FOR EACH ROW EXECUTE FUNCTION overturn_email_test_failure()`);
  await assert.rejects(queueResultOverturnEmails({...input,fixtureId:next.id,decisionId:nextDecision}));
  assert.equal(await prisma.notificationDispatch.count({where:{sourceId:nextDecision}}),0);
  await prisma.$executeRawUnsafe(`DROP TRIGGER overturn_email_test_failure_trigger ON "NotificationDispatch"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION overturn_email_test_failure()`);
  assert.equal((await queueResultOverturnEmails({...input,fixtureId:next.id,decisionId:nextDecision})).created,3);
  const final = await prisma.notificationDispatch.findMany({where:{sourceId:nextDecision}});
  assert.ok(!JSON.stringify(final).includes("SECRET_"));pass("mid-queue failure rolls back both teams; retry succeeds without leaking private fields anywhere in dispatch");
  console.log(`ALL ${count} email database checks passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
