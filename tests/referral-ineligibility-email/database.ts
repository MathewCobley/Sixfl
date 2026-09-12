import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { prisma } from "../../src/lib/prisma";
import { markReferralIneligible } from "../../src/lib/team-referral-eligibility";
import { getReferralIneligibilityEmailPanel, queueReferralIneligibilityEmail, REFERRAL_INELIGIBLE_EMAIL_SOURCE as source } from "../../src/lib/referral-ineligibility-email";

const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.REFERRAL_TEST_DATABASE, '1');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)); assert.equal(url.pathname, '/sixfl_referral_test');
globalThis.fetch = async () => { throw Error('No external requests permitted'); };

async function main() {
  const admin = await prisma.user.create({data:{name:'Administrator',email:'email-admin@example.invalid',role:'ADMIN'}});
  const player = await prisma.user.create({data:{name:'Test Player',email:'referring-player@example.invalid'}});
  async function makeReferral(rejected = true, userId = player.id) {
    const id=randomUUID();
    const lead=await prisma.interestLead.create({data:{contactName:'Different captain',email:`${id}@example.invalid`,interestType:'TEAM',teamName:'Example renamed team',area:'Test',status:'NEW'}});
    await prisma.$executeRaw`INSERT INTO "TeamReferral" (id,"referrerUserId","interestLeadId","updatedAt") VALUES (${id},${userId},${lead.id},NOW())`;
    if (rejected) await markReferralIneligible({referralId:id,actorUserId:admin.id,reasonCode:'EXISTING_TEAM',note:'PRIVATE_SENTINEL supporting evidence and old team identity.',confirmed:true});
    return id;
  }
  const id=await makeReferral();
  const request={referralId:id,actorUserId:admin.id,confirmed:true};
  const count=()=>prisma.notificationDispatch.count({where:{sourceType:source}});
  assert.equal(await count(),0);
  const panel=await getReferralIneligibilityEmailPanel(id,admin.id);
  assert.equal(panel.email,player.email);assert.match(panel.body,/Existing or renamed team/);assert.match(panel.body,/£75/);
  assert.equal(await count(),0);assert.ok(!JSON.stringify(panel).includes('PRIVATE_SENTINEL'));
  await assert.rejects(queueReferralIneligibilityEmail({...request,actorUserId:player.id}));
  await assert.rejects(queueReferralIneligibilityEmail({...request,confirmed:false}));
  const eligible=await makeReferral(false);
  await assert.rejects(queueReferralIneligibilityEmail({...request,referralId:eligible}));
  const before=await prisma.$queryRaw`SELECT to_jsonb(r) AS row FROM "TeamReferral" r WHERE id=${id}`;
  const sent=await Promise.all([queueReferralIneligibilityEmail(request),queueReferralIneligibilityEmail(request),queueReferralIneligibilityEmail(request)]);
  assert.equal(new Set(sent.map(r=>r.dispatchId)).size,1);assert.equal(await count(),1);
  const dispatch=await prisma.notificationDispatch.findUniqueOrThrow({where:{id:sent[0].dispatchId},include:{recipient:true,template:true}});
  assert.equal(dispatch.status,'QUEUED');assert.equal(dispatch.recipient.sourceId,player.id);assert.equal(dispatch.recipient.email,player.email);
  assert.equal(dispatch.template?.key,source);assert.equal(dispatch.channel,'EMAIL');assert.match(dispatch.bodyText,/No payment|no payment/);
  for (const content of [dispatch.bodyText,dispatch.bodyHtml,JSON.stringify(dispatch.variables),JSON.stringify(dispatch.metadata),dispatch.subject]) assert.doesNotMatch(content||'',/PRIVATE_SENTINEL|Different captain/);
  assert.deepEqual(await prisma.$queryRaw`SELECT to_jsonb(r) AS row FROM "TeamReferral" r WHERE id=${id}`,before);
  // The old reward-email cancellation safeguard must not block the decision notice.
  await prisma.notificationDispatch.update({where:{id:dispatch.id},data:{status:'PROCESSING'}});
  await prisma.notificationDispatch.update({where:{id:dispatch.id},data:{status:'SENT',sentAt:new Date()}});
  assert.equal((await queueReferralIneligibilityEmail(request)).existing,true);
  assert.equal((await getReferralIneligibilityEmailPanel(id,admin.id)).record?.status,'SENT');
  assert.equal(await count(),1);
  console.log('PASS public-only preview, permissions, recipient targeting, atomic duplicates and real send claim');

  const second=await makeReferral();
  await prisma.notificationRecipient.update({where:{id:dispatch.recipientId},data:{isSuppressed:true}});
  const skipped=await queueReferralIneligibilityEmail({...request,referralId:second});assert.equal(skipped.status,'SKIPPED');
  assert.equal((await queueReferralIneligibilityEmail({...request,referralId:second})).dispatchId,skipped.dispatchId);
  assert.equal((await prisma.notificationRecipient.findUniqueOrThrow({where:{id:dispatch.recipientId}})).isSuppressed,true);
  await prisma.notificationRecipient.update({where:{id:dispatch.recipientId},data:{isSuppressed:false}});
  await prisma.notificationPreference.update({where:{recipientId:dispatch.recipientId},data:{emailEnabled:false}});
  const optedOut=await queueReferralIneligibilityEmail({...request,referralId:await makeReferral()});assert.equal(optedOut.status,'SKIPPED');
  await prisma.notificationPreference.update({where:{recipientId:dispatch.recipientId},data:{emailEnabled:true}});
  const missing=await prisma.user.create({data:{name:'Missing Email'}});
  await assert.rejects(queueReferralIneligibilityEmail({...request,referralId:await makeReferral(true,missing.id)}),/no email/);
  console.log('PASS suppression, channel preferences and missing-address feedback');

  const retryId=await makeReferral();
  await prisma.notificationTemplate.update({where:{key:source},data:{isActive:false}});
  await assert.rejects(queueReferralIneligibilityEmail({...request,referralId:retryId}),/Enable/);
  assert.equal((await getReferralIneligibilityEmailPanel(retryId,admin.id)).record,null);
  await prisma.notificationTemplate.update({where:{key:source},data:{isActive:true,body:'Edited by administrator: {{teamName}} — {{eligibilityReason}}. No payment is due.'}});
  const seed=fs.readFileSync('prisma/migrations/20260912203000_referral_ineligibility_email/migration.sql','utf8').split('-- Exactly one')[0];
  await prisma.$executeRawUnsafe(seed);
  assert.match((await prisma.notificationTemplate.findUniqueOrThrow({where:{key:source}})).body,/Edited by administrator/);
  const retry=await queueReferralIneligibilityEmail({...request,referralId:retryId});
  assert.match((await prisma.notificationDispatch.findUniqueOrThrow({where:{id:retry.dispatchId}})).bodyText,/Edited by administrator/);
  await prisma.notificationDispatch.update({where:{id:retry.dispatchId},data:{status:'FAILED'}});
  assert.equal((await queueReferralIneligibilityEmail({...request,referralId:retryId})).dispatchId,retry.dispatchId);
  console.log('PASS template edits preserved, inactive-template recovery and no duplicate failed emails');

  await assert.rejects(prisma.notificationDispatch.create({data:{recipientId:dispatch.recipientId,channel:'EMAIL',audience:'USER',sourceType:source,sourceId:id,status:'QUEUED',bodyText:'duplicate'}}));
  await assert.rejects(prisma.notificationDispatch.create({data:{recipientId:dispatch.recipientId,channel:'EMAIL',audience:'USER',sourceType:source,sourceId:eligible,status:'QUEUED',bodyText:'not rejected'}}));
  await assert.rejects(prisma.notificationDispatch.create({data:{recipientId:dispatch.recipientId,channel:'SMS',audience:'USER',sourceType:source,sourceId:await makeReferral(),status:'QUEUED',bodyText:'wrong channel'}}));
  const rollback=await makeReferral();
  await prisma.$executeRawUnsafe(`CREATE FUNCTION referral_email_test_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sourceId"='${rollback}' THEN RAISE EXCEPTION 'deliberate failure'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER referral_email_test_rollback BEFORE INSERT ON "NotificationDispatch" FOR EACH ROW EXECUTE FUNCTION referral_email_test_rollback()`);
  await assert.rejects(queueReferralIneligibilityEmail({...request,referralId:rollback}));
  assert.equal((await getReferralIneligibilityEmailPanel(rollback,admin.id)).record,null);
  await prisma.$executeRawUnsafe('DROP TRIGGER referral_email_test_rollback ON "NotificationDispatch"');
  await prisma.$executeRawUnsafe('DROP FUNCTION referral_email_test_rollback()');
  assert.equal((await queueReferralIneligibilityEmail({...request,referralId:rollback})).status,'QUEUED');
  console.log('PASS database uniqueness, eligible/SMS guard and rollback/retry; ALL email checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
