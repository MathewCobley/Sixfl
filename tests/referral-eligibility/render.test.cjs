const {test}=require('node:test');const assert=require('node:assert/strict');const React=require('react');const{renderToStaticMarkup}=require('react-dom/server');
const{load}=require('../result-overturn/loader.cjs');
const row={id:'referral',referrerUserId:'player',referrerName:'Test referrer',referrerEmail:'player@example.invalid',teamName:'Example team',leagueName:'Test league',rewardPence:7500,requiredMatches:3,completedMatches:3,paidAt:null,payoutDetailsSubmittedAt:new Date(),createdAt:new Date(),ineligibleAt:new Date(),ineligibleReasonCode:'EXISTING_TEAM',ineligibleNote:'PRIVATE_SENTINEL'};
const stubs={'next/link':{__esModule:true,default:p=>React.createElement('a',{href:p.href},p.children)},'next-auth':{getServerSession:async()=>({user:{email:'player@example.invalid'}})},'next/navigation':{redirect(){throw Error('redirect')},notFound(){throw Error('notfound')}},'@/auth':{},'@/lib/prisma':{prisma:{user:{findUnique:async()=>({id:'player'})}}},'@/lib/team-referrals':{getTeamReferrals:async()=>[row],getOrCreateReferralCode:async()=>'SIX-TEST',referralStatus:r=>r.ineligibleAt?'INELIGIBLE':'READY'},'@/lib/team-referral-payout':{getTeamReferralPayoutDetails:async()=>{throw Error('must not load bank details')}},'@/lib/requireAdmin':{requireAdmin:async()=>({user:{id:'admin',role:'ADMIN'}})},'./actions':{},'../../actions':{}};
test('player referral and both old payout links show not eligible, no bank details or private note',async()=>{
 for(const file of ['src/app/player/referrals/page.tsx','src/app/player/referrals/payout/[id]/page.tsx','src/app/(admin)/admin/referrals/payout/[id]/page.tsx']){
  const Page=load(file,stubs).default;const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:row.id}),searchParams:Promise.resolve({saved:'1'})}));
  assert.match(html,/Not eligible/);assert.match(html,/Existing or renamed team/);assert.doesNotMatch(html,/PRIVATE_SENTINEL|Provide payment details|saved securely|View bank details|name="accountNumber"/);
 }
});
test('ineligibility form binds the exact referral and requires public reason, private note and confirmation',()=>{
 const Form=load('src/components/admin/ReferralIneligibilityForm.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Form,{referralId:'exact-referral',teamName:'Example',referrerName:'Player',action:async()=>{}}));
 assert.match(html,/exact-referral/);assert.match(html,/Existing or renamed team/);assert.match(html,/Private admin note/);assert.match(html,/name="confirmed"/);assert.match(html,/Confirm not eligible/);assert.doesNotMatch(html,/<select/);
});
