const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {load}=require('../result-overturn/loader.cjs');
const db={};
const {referralStatus}=load('src/lib/team-referrals.ts',{'@/lib/prisma':{prisma:db},'@/lib/team-referral-notifications':{}});
test('ineligible never becomes ready after more matches and does not change other statuses',()=>{
 for(const completedMatches of [0,3,10]) assert.equal(referralStatus({ineligibleAt:new Date(),paidAt:null,requiredMatches:3,completedMatches}),'INELIGIBLE');
 assert.equal(referralStatus({paidAt:null,requiredMatches:3,completedMatches:2}),'TRACKING');
 assert.equal(referralStatus({paidAt:null,requiredMatches:3,completedMatches:3}),'READY');
 assert.equal(referralStatus({paidAt:new Date(),requiredMatches:3,completedMatches:3}),'PAID');
});
test('email producers and the database send-claim gate check eligibility; private notes stay out of player reads',()=>{
 const notifications=fs.readFileSync('src/lib/team-referral-notifications.ts','utf8');
 assert.equal((notifications.match(/r\."ineligibleAt" IS NULL/g)||[]).length,4);
 assert.match(notifications,/referralRewardEmailBlock/);
 const migration=fs.readFileSync('prisma/migrations/20260912193000_referral_ineligibility/migration.sql','utf8');
 assert.match(migration,/NEW.status IN \('QUEUED','PROCESSING'\)/);assert.match(migration,/FOR UPDATE/);
 const processor=fs.readFileSync('src/lib/notifications/processor.ts','utf8');assert.ok(processor.indexOf('markNotificationDispatchProcessing(dispatch.id)')<processor.indexOf('sendEmailWithResend({'));
 const read=fs.readFileSync('src/lib/team-referrals.ts','utf8');assert.doesNotMatch(read,/ineligibleNote|ineligibleByName/);
 for(const file of ['src/app/player/referrals/page.tsx','src/app/player/referrals/payout/[id]/page.tsx'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/ineligibleNote|ineligibleByName/);
});
test('server action rejects non-admins and binds the audit to the authenticated actor, not posted identity',async()=>{
 let user=null,input=null;const paths=[];
 const action=load('src/app/(admin)/admin/referrals/actions.ts',{
  '@/lib/prisma':{prisma:{}},'@/lib/requireAdmin':{requireAdmin:async()=>({user})},'@/lib/team-referral-payout':{},'@/lib/team-referral-notifications':{},'@/lib/team-referrals':{},
  '@/lib/team-referral-eligibility':{ReferralEligibilityError:Error,markReferralIneligible:async v=>{input=v}},
  'next/cache':{revalidatePath:p=>paths.push(p)},'next/navigation':{redirect:p=>{throw new Error(p)}},
 }).markReferralIneligibleAction;
 const f=new FormData();Object.entries({referralId:'test',actorUserId:'forged',reasonCode:'EXISTING_TEAM',note:'An existing team renamed.',confirmed:'yes'}).forEach(([k,v])=>f.set(k,v));
 for(const u of [null,{id:'player',role:'USER'}]){user=u;await assert.rejects(action(f),/Administrator/);assert.equal(input,null);}
 user={id:'admin',role:'ADMIN'};await assert.rejects(action(f),/ineligible=1/);assert.equal(input.actorUserId,'admin');assert.equal(input.confirmed,true);assert.ok(paths.includes('/player/referrals'));
});
