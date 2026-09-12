import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { markReferralIneligible, getReferralEligibilityAudit, referralRewardEmailBlock } from "../../src/lib/team-referral-eligibility";
import { getTeamReferrals, referralStatus } from "../../src/lib/team-referrals";
import { saveTeamReferralPayoutDetails, getTeamReferralPayoutDetails } from "../../src/lib/team-referral-payout";
import { queueReferralRecordedEmail, queueReferralPayoutReadyEmail, queueMissingReferralRecordedEmails, queueReadyReferralPayoutEmails } from "../../src/lib/team-referral-notifications";
const url=new URL(process.env.DATABASE_URL!);assert.equal(process.env.REFERRAL_TEST_DATABASE,'1');assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.pathname,'/sixfl_referral_test');
globalThis.fetch=async()=>{throw Error('Outbound requests forbidden in test')};
async function main(){
 const admin=await prisma.user.create({data:{email:'ref-admin@example.invalid',name:'Test administrator',role:'ADMIN'}});
 const player=await prisma.user.create({data:{email:'ref-player@example.invalid',name:'Player'}});
 const lead=await prisma.interestLead.create({data:{contactName:'Captain',email:'captain@example.invalid',interestType:'TEAM',teamName:'Example team',area:'Test',status:'NEW'}});
 const recipient=await prisma.notificationRecipient.create({data:{sourceType:'USER',sourceId:player.id,audience:'USER',displayName:'Player',email:player.email,emailNormalized:player.email}});
 async function referral(){const id=randomUUID();await prisma.$executeRaw`INSERT INTO "TeamReferral" (id,"referrerUserId","interestLeadId","updatedAt") VALUES (${id},${player.id},${lead.id},NOW())`;return id;}
 const id=await referral();const input={referralId:id,actorUserId:admin.id,reasonCode:'EXISTING_TEAM',note:'PRIVATE_SENTINEL: this team already played under a previous name.',confirmed:true};
 const queued=await prisma.notificationDispatch.create({data:{recipientId:recipient.id,channel:'EMAIL',audience:'USER',sourceType:'team-referral-payout-ready',sourceId:id,status:'QUEUED',bodyText:'test'}});
 const sent=await prisma.notificationDispatch.create({data:{recipientId:recipient.id,channel:'EMAIL',audience:'USER',sourceType:'team-referral-recorded',sourceId:id,status:'SENT',bodyText:'previous',sentAt:new Date()}});
 const unrelated=await prisma.notificationDispatch.create({data:{recipientId:recipient.id,channel:'EMAIL',audience:'USER',sourceType:'unrelated',sourceId:id,status:'QUEUED',bodyText:'other'}});
 for(const patch of [{actorUserId:player.id},{confirmed:false},{reasonCode:'ARBITRARY'},{note:''}])await assert.rejects(markReferralIneligible({...input,...patch}));
 assert.equal((await getTeamReferrals())[0].ineligibleAt,null);console.log('PASS permissions, confirmation and reason validation');
 await prisma.$executeRaw`UPDATE "TeamReferral" SET "payoutDetailsCiphertext"='encrypted-test', "payoutDetailsIv"='iv-test', "payoutDetailsAuthTag"='tag-test', "payoutDetailsSubmittedAt"=NOW() WHERE id=${id}`;
 const leadBefore=JSON.stringify(await prisma.interestLead.findUnique({where:{id:lead.id}}));
 await prisma.notificationDispatch.update({where:{id:queued.id},data:{status:'PROCESSING'}});
 await assert.rejects(markReferralIneligible(input),/currently sending/);
 await prisma.notificationDispatch.update({where:{id:queued.id},data:{status:'QUEUED'}});
 const results=await Promise.all([markReferralIneligible(input),markReferralIneligible(input)]);assert.equal(results.filter(r=>r.unchanged).length,1);
 const row=(await getTeamReferrals(player.id))[0];assert.equal(referralStatus(row),'INELIGIBLE');assert.equal(referralStatus({...row,completedMatches:10}),'INELIGIBLE');assert.ok(!JSON.stringify(row).includes('PRIVATE_SENTINEL'));
 const audit=(await getReferralEligibilityAudit(admin.id))[0];assert.equal(audit.ineligibleNote,input.note);await assert.rejects(getReferralEligibilityAudit(player.id));
 assert.equal((await prisma.notificationDispatch.findUniqueOrThrow({where:{id:queued.id}})).status,'CANCELLED');assert.equal((await prisma.notificationDispatch.findUniqueOrThrow({where:{id:sent.id}})).status,'SENT');assert.equal((await prisma.notificationDispatch.findUniqueOrThrow({where:{id:unrelated.id}})).status,'QUEUED');
 assert.equal(JSON.stringify(await prisma.interestLead.findUnique({where:{id:lead.id}})),leadBefore);assert.equal(await prisma.notificationDispatch.count(),3);console.log('PASS concurrent rejection retained, public/private audit separated, only unsent reward messages cancelled');
 assert.equal((await queueReferralRecordedEmail(id)).queued,false);assert.equal((await queueReferralPayoutReadyEmail(id)).queued,false);assert.equal((await queueMissingReferralRecordedEmails()).checked,0);assert.equal((await queueReadyReferralPayoutEmails()).checked,0);
 assert.ok(await referralRewardEmailBlock({sourceType:'team-referral-recorded',sourceId:id}));assert.equal(await referralRewardEmailBlock({sourceType:'unrelated',sourceId:id}),null);
 await assert.rejects(prisma.notificationDispatch.update({where:{id:queued.id},data:{status:'QUEUED'}}));
 await assert.rejects(prisma.notificationDispatch.create({data:{recipientId:recipient.id,channel:'EMAIL',audience:'USER',sourceType:'team-referral-recorded',sourceId:id,status:'QUEUED',bodyText:'stale'}}));
 assert.equal(await prisma.notificationDispatch.count(),3);console.log('PASS automatic/retry/stale producer and worker claims blocked');
 await assert.rejects(saveTeamReferralPayoutDetails({referralId:id,referrerUserId:player.id,details:{accountHolderName:'Test Person',sortCode:'123456',accountNumber:'12345678'}}),/not eligible/);
 assert.equal(await getTeamReferralPayoutDetails(id),null);
 await assert.rejects(prisma.$executeRaw`UPDATE "TeamReferral" SET "paidAt"=NOW() WHERE id=${id}`);
 await assert.rejects(prisma.$executeRaw`UPDATE "TeamReferral" SET "ineligibleNote"='changed review note' WHERE id=${id}`);
 await assert.rejects(prisma.$executeRaw`DELETE FROM "TeamReferral" WHERE id=${id}`);console.log('PASS bank submission, payout, audit rewrite and deletion blocked');
 // Paid case: use a separate lead; paid rows cannot be relabelled or clawed back.
 const lead2=await prisma.interestLead.create({data:{contactName:'Other Captain',email:'other@example.invalid',interestType:'TEAM',teamName:'Another team',area:'Test',status:'NEW'}});
 const paid=randomUUID();await prisma.$executeRaw`INSERT INTO "TeamReferral" (id,"referrerUserId","interestLeadId","paidAt","updatedAt") VALUES (${paid},${player.id},${lead2.id},NOW(),NOW())`;
 await assert.rejects(markReferralIneligible({...input,referralId:paid}),/already been paid/);console.log('PASS paid rewards preserved');

 const lead3=await prisma.interestLead.create({data:{contactName:'Rollback Captain',email:'rollback@example.invalid',interestType:'TEAM',teamName:'Rollback team',area:'Test',status:'NEW'}});
 const rollback=randomUUID();await prisma.$executeRaw`INSERT INTO "TeamReferral" (id,"referrerUserId","interestLeadId","updatedAt") VALUES (${rollback},${player.id},${lead3.id},NOW())`;
 const rollbackEmail=await prisma.notificationDispatch.create({data:{recipientId:recipient.id,channel:'EMAIL',audience:'USER',sourceType:'team-referral-recorded',sourceId:rollback,status:'QUEUED',bodyText:'rollback-test'}});
 await prisma.$executeRawUnsafe(`CREATE FUNCTION referral_test_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sourceId"='${rollback}' AND NEW.status='CANCELLED' THEN RAISE EXCEPTION 'deliberate cancellation rollback'; END IF; RETURN NEW; END $$`);
 await prisma.$executeRawUnsafe(`CREATE TRIGGER referral_test_rollback BEFORE UPDATE ON "NotificationDispatch" FOR EACH ROW EXECUTE FUNCTION referral_test_rollback()`);
 await assert.rejects(markReferralIneligible({...input,referralId:rollback}));
 assert.equal((await getTeamReferrals()).find(r=>r.id===rollback)!.ineligibleAt,null);
 assert.equal((await prisma.notificationDispatch.findUniqueOrThrow({where:{id:rollbackEmail.id}})).status,'QUEUED');
 await prisma.$executeRawUnsafe(`DROP TRIGGER referral_test_rollback ON "NotificationDispatch"`);await prisma.$executeRawUnsafe(`DROP FUNCTION referral_test_rollback()`);
 await markReferralIneligible({...input,referralId:rollback});console.log('PASS failed cancellation rolls the decision back and retry succeeds');
 console.log('ALL referral eligibility database checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
