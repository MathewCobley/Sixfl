const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {redirect} = require('next/navigation');
const {isRedirectError} = require('next/dist/client/components/redirect-error');
const {getURLFromRedirectError} = require('next/dist/client/components/redirect');
const helperPath = 'src/lib/payments/squad-collection-form.ts';
const actionPath = 'src/app/captain/team/[teamid]/player-payments/actions.ts';
const feedbackPath = 'src/app/captain/team/[teamid]/player-payments/collection-feedback-action.ts';

// Execute actual native/prepared modules. No external HTTP or database is reachable.
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'), {fileName:file, compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const m = {exports:{}};
  new Function('require','module','exports','fetch',js)(id => {
    if (Object.hasOwn(mocks,id)) return mocks[id];
    if (id === '@/lib/payments/squad-collection-form') return load(helperPath);
    if (['next/navigation','next/dist/client/components/redirect-error','next/dist/client/components/redirect'].includes(id)) return require(id);
    throw Error('Unmocked dependency: '+id);
  },m,m.exports,()=>{throw Error('No external requests in collection tests');});
  return m.exports;
}
const helper = load(helperPath);
function form(defaultAmount='0', count=8) {
  const data = new FormData(); data.set('teamId','team'); data.set('fixtureId','fixture'); data.set('amount',defaultAmount);
  for(let i=1;i<=count;i++){data.append('player',`member:m${i}`);data.set(`amount_member_m${i}`,'5');data.set(`collection_member_m${i}`,'link');}
  return data;
}
function harness({initial=[],unauthorised=false,missingEmail=false,failQueue=false,headroom=0}={}) {
  const rows=structuredClone(initial),writes=[],emails=[],auth=[];
  const members=Array.from({length:8},(_,i)=>({id:`m${i+1}`,user:{email: missingEmail&&i===7 ? null : `player${i+1}@example.invalid`}}));
  const fixture={id:'fixture',leagueId:'league',kickoffAt:new Date(),publishedAt:new Date(),status:'SCHEDULED',matchFeePence:4000,homeMatchFeePence:4000,awayMatchFeePence:4000,league:{name:'Test',season:'Test'},homeTeam:{id:'team',name:'Test'},awayTeam:{id:'other',name:'Other'}};
  const matches=(row,where)=>Object.entries(where).every(([key,value])=>key==='OR'||(value && typeof value==='object' ? value.in ? value.in.includes(row[key]) : true : row[key]===value));
  const prisma={
    fixture:{findFirst:async()=>fixture,findUnique:async()=>fixture,update:async()=>{throw Error('Do not repair an already valid fixture');}},
    teamMember:{findMany:async({where})=>members.filter(m=>!where.id||where.id.in.includes(m.id)),findFirst:async({where})=>members.find(m=>m.id===where.id)},
    teamPlayerProspect:{findMany:async()=>[],findFirst:async()=>null},
    paymentCharge:{findMany:async()=>[{id:'charge',teamId:'team',amountPence:4000}],findFirst:async()=>null},
    playerMatchFee:{
      findMany:async({where})=>rows.filter(row=>matches(row,where)),
      findFirst:async({where})=>rows.find(row=>matches(row,where))??null,
      aggregate:async()=>({_sum:{amountPence:0}}),
      create:async({data})=>{const row={id:`fee-${rows.length+1}`,...data};rows.push(row);writes.push(['create',row.id]);return row;},
      update:async({where,data})=>{const row=rows.find(r=>r.id===where.id);assert.ok(row);Object.assign(row,data);writes.push(['update',row.id]);return row;},
    },
  };
  const mocks={
    '@/lib/prisma':{prisma},
    '@/lib/requireCaptain':{requireCaptain:async(team)=>{auth.push(team);if(unauthorised)redirect('/login');return {user:{id:'captain'},isCaptain:true};}},
    '@/lib/managed-squad/squadStatus':{getTeamMemberSquadStatusMap:async()=>new Map()},
    '@/lib/teamMemberProfiles':{getTeamMemberProfilesByTeamMemberIds:async()=>new Map()},
    '@/lib/payments/player-ledger':{isPlayerFeeLedgerControlled:async id=>rows.some(r=>r.id===id&&r.controlled),pausePlayerFeeCollection:async()=>{throw Error('No pause in this test');}},
    'next/cache':{revalidatePath:()=>{}},
    '@/lib/payments/cancel-player-match-fee-notifications':{cancelQueuedPlayerMatchFeeNotificationDispatches:async()=>{}},
    '@/lib/payments/fixture-match-fees':{syncFixtureMatchFeeCharges:async()=>({activeCharges:[{id:'charge',teamId:'team',amountPence:4000}]})},
    '@/lib/payments/team-payment-ledger':{getTeamPaymentLedger:async()=>({entries:[{id:'charge',teamId:'team',fixtureId:'fixture',displayStatus:'OPEN',amountPence:4000,playerPaidPence:0,directPaidPence:0,outstandingPence:4000}]})},
    '@/lib/payments/team-credit-policy':{applyExistingTeamCreditToChargeFirst:async()=>({policy:{creditHeadroomPence:headroom}}),getMaximumAdditionalCollectionPence:({outstandingFixturePence,creditHeadroomPence})=>outstandingFixturePence+creditHeadroomPence},
    '@/lib/payments/player-match-fees':{ensurePlayerMatchFeePaymentDetailsForFees:async()=>{},queuePlayerMatchFeeReminder:async args=>{if(failQueue)throw Error('synthetic queue failure');emails.push(args);return {queued:1,skipped:0};}},
  };
  const actions=load(actionPath,mocks);
  const feedback=load(feedbackPath,{'./actions':actions});
  return {rows,writes,emails,auth,save:feedback.saveCaptainSquadPaymentCollectionWithFeedback,legacy:actions.createCaptainSquadPaymentCollectionAction};
}

test('waived first row cannot supply a zero default; positive OPEN share wins',()=>{
  assert.equal(helper.getInitialCollectionDefaultPence([{status:'WAIVED',amountPence:0},{status:'OPEN',amountPence:500}]),500);
  assert.ok(helper.getInitialCollectionDefaultPence([{status:'WAIVED',amountPence:0}])>0);
});
test('currency parser accepts exact UK amounts and legitimate grouping without changing decimal intent',()=>{
  for(const [raw,pence] of [['5',500],['5.50',550],[' £ 5.50 ',550],['1,000.50',100050],['.50',50]])assert.equal(helper.parseSquadCollectionAmount(raw),pence,raw);
  assert.equal(helper.parseSquadCollectionAmount('0'),null);assert.equal(helper.parseSquadCollectionAmount('0',true),0);assert.equal(helper.parseSquadCollectionAmount('',true),null);
});
for(const defaultAmount of ['0','','-1','not used'])test(`eight explicit £5 shares do not require the unused default (${JSON.stringify(defaultAmount)})`,async()=>{
  const h=harness(),data=form(defaultAmount);assert.equal(helper.validateSquadCollectionAmounts(data),null);
  const result=await h.save(data);assert.equal(result.status,'saved');assert.match(result.message,/8 payment link emails queued/);
  assert.equal(h.rows.length,8);assert.ok(h.rows.every(r=>r.amountPence===500&&r.status==='OPEN'));assert.equal(h.emails.length,8);assert.deepEqual(h.auth,['team']);
  assert.ok(h.emails.every(e=>e.mode==='request'&&e.force===undefined&&e.channels.join()==='EMAIL'));
});
test('missing required default is rejected before any player write or email',async()=>{
  const h=harness(),data=form('0');data.set('amount_member_m8','');
  const result=await h.save(data);assert.equal(result.status,'error');assert.match(result.message,/positive default/);assert.equal(h.writes.length,0);assert.equal(h.emails.length,0);
});
test('valid default fills a blank share, preserving explicitly entered shares',async()=>{
  const data=form('6');data.set('amount_member_m8','');
  const withHeadroom=harness({headroom:100});await withHeadroom.save(data);assert.equal(withHeadroom.rows.find(r=>r.teamMemberId==='m8').amountPence,600);
});
for(const value of ['-5','5.001','NaN','Infinity','3e9','5,50','5 50','££5','1,23.45'])test(`invalid selected amount ${value} is rejected before writes`,async()=>{
  const h=harness(),data=form('5');data.set('amount_member_m8',value);
  const result=await h.save(data);assert.equal(result.status,'error');assert.equal(h.writes.length,0);assert.equal(h.emails.length,0);
});
test('unselected invalid amount is irrelevant; explicit zero remains a no-charge share',async()=>{
  const h=harness(),data=form('5');data.set('amount_member_unselected','-10');data.set('amount_member_m1','0');
  const result=await h.save(data);assert.equal(result.status,'saved');assert.equal(h.rows.find(r=>r.teamMemberId==='m1').status,'WAIVED');assert.equal(h.emails.length,7);
});
test('paid and ledger-protected rows are unchanged when absent from editable FormData',async()=>{
  const initial=[{id:'protected',teamId:'team',fixtureId:'fixture',teamMemberId:'locked',status:'OPEN',amountPence:500,controlled:true,note:'Repayment audit'}, {id:'paid',teamId:'team',fixtureId:'fixture',teamMemberId:'paid-member',status:'PAID',amountPence:500,paidAt:'original',note:'Original payment'}];
  const h=harness({initial,headroom:1000});const result=await h.save(form('0'));
  assert.equal(result.status,'saved');assert.deepEqual(h.rows.slice(0,2),initial);assert.ok(h.writes.every(([,id])=>!['protected','paid'].includes(id)));assert.ok(h.emails.every(e=>!['protected','paid'].includes(e.feeId)));
});
test('missing email still blocks new player links',async()=>{
  const h=harness({missingEmail:true});const result=await h.save(form('5'));assert.equal(result.status,'error');assert.match(result.message,/email/);assert.equal(h.writes.length,0);assert.equal(h.emails.length,0);
});
test('auth redirect is rethrown, never relabelled saved',async()=>{
  const h=harness({unauthorised:true});await assert.rejects(h.save(form('5')),e=>isRedirectError(e)&&getURLFromRedirectError(e)==='/login');assert.equal(h.writes.length,0);
});
test('unexpected failure after rows save is unconfirmed, not false success or automatic retry',async()=>{
  const h=harness({failQueue:true});const result=await h.save(form('5'));assert.equal(result.status,'unconfirmed');assert.match(result.message,/do not assume nothing was saved/);assert.equal(h.rows.length,8);assert.equal(h.writes.length,8);
});
test('unrelated, malformed, auth and unknown result URLs never produce acknowledgement',()=>{
  for(const target of ['/login','https://evil.invalid/captain/team/team/player-payments?fixtureId=fixture&saved=collection_created','/captain/team/other/player-payments?fixtureId=fixture&saved=collection_created','/captain/team/team/player-payments?fixtureId=other&saved=collection_created','/captain/team/team/player-payments?fixtureId=fixture&error=unknown','/captain/team/team/player-payments?fixtureId=fixture&saved=collection_created&emailsQueued=-1'])assert.equal(helper.collectionFeedbackFromRedirect(target,'team','fixture'),null,target);
});
test('canonical legacy action also fixes zero unused default, retaining redirect contract',async()=>{
  const h=harness();await assert.rejects(h.legacy(form('0')),e=>isRedirectError(e)&&getURLFromRedirectError(e).includes('saved=collection_created'));assert.equal(h.rows.length,8);
});
test('owning page has one shared form; protection and queued/not-delivered feedback survive preparation',()=>{
  const page=fs.readFileSync('src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx','utf8');
  assert.match(page, /getInitialCollectionDefaultPence\(currentTeamFees\)/);assert.match(page,/saveAction=\{saveCaptainSquadPaymentCollectionWithFeedback\}/);assert.match(page,/disabled=\{ledgerControlled \|\| \(player.emailRequired && !player.fee\)\}/);
  const formSource=fs.readFileSync('src/components/payments/SquadPaymentCollectionForm.tsx','utf8');
  assert.match(formSource,/noValidate onSubmit=\{submit\}/);assert.match(formSource,/inFlight.current = true/);assert.match(formSource,/role=\{feedback.status === "saved" \? "status" : "alert"\}/);assert.doesNotMatch(formSource,/querySelector|MutationObserver|localStorage|sessionStorage/);
});
if(fs.readFileSync(actionPath,'utf8').includes('playerAllocationBudgetPence'))test('prepared action retains over-allocation rejection',async()=>{
  const h=harness(),data=form('5');data.set('amount_member_m1','10');const result=await h.save(data);assert.equal(result.status,'error');assert.match(result.message,/permitted collection/);assert.equal(h.writes.length,0);
});
