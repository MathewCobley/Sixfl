const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const money = p => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(p/100);
const read = p => fs.readFileSync(path.join(process.cwd(),p),'utf8');
const pagePath='src/app/captain/team/[teamid]/payments/page.tsx';
const displayPath='src/lib/payments/player-payment-display.ts';
const presentationPath='src/lib/payments/payment-ledger-presentation.ts';

// All database and network boundaries are explicit mocks. Actual presentation,
// canonical charge summary, coverage rules and React page source are executed.
function loader(mocks={}) {
  const cache=new Map();
  const defaults={
    '@/lib/prisma':{prisma:{$queryRaw:async()=>[]}},
    '@/lib/payments/player-ledger':{money},
  };
  const supplied={...defaults,...mocks};
  const allowed=new Set([pagePath,displayPath,presentationPath,'src/lib/payments/player-fee-coverage.ts',
    'src/lib/payments/player-ledger-markers.ts','src/lib/payments/charge-summary.ts','src/lib/payments/team-charge-waivers.ts']);
  function load(file) {
    if(!path.extname(file))file+='.ts';
    assert.ok(allowed.has(file),`Unexpected runtime module ${file}`);
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const compiled=ts.transpileModule(read(file),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    new Function('require','module','exports','fetch',compiled)(id=>{
      let resolved=id;
      if(id.startsWith('.'))resolved='@/'+path.posix.normalize(path.posix.join(path.posix.dirname(file),id)).replace(/^src\//,'').replace(/\.tsx?$/,'');
      if(Object.hasOwn(supplied,resolved))return supplied[resolved];
      if(id==='react'||id.startsWith('react/')||id==='@prisma/client'||id.startsWith('node:'))return require(id);
      if(resolved.startsWith('@/'))return load('src/'+resolved.slice(2));
      throw new Error(`Unmocked dependency ${id}`);
    },module,module.exports,()=>{throw new Error('External requests are forbidden in ledger tests');});
    return module.exports;
  }
  return load;
}
function fixtureFees() {
  return [
    {amountPence:800,status:'WAIVED',note:'Zero-fee player share waived by SIXFL',captainAssignedAmountPence:800},
    {amountPence:800,status:'PAID',note:null,captainAssignedAmountPence:800},
    {amountPence:800,status:'WAIVED',note:'Zero-fee player share waived by SIXFL',captainAssignedAmountPence:800},
    {amountPence:500,status:'PAID',note:'Player fee cap applied: captain share £8.00; player charged £5.00.',captainAssignedAmountPence:800},
    {amountPence:500,status:'PAID',note:null,captainAssignedAmountPence:800},
  ].map((f,i)=>({...f,id:`fee-${i}`,teamId:'test-team',fixtureId:'test-fixture',teamMember:{user:{name:`Player ${i+1}`,email:`player${i+1}@example.invalid`}},prospect:null}));
}
function summaryFor(fees,transactions=[],amountPence=4000) {
  const [{charge,...summary}]=loader()('src/lib/payments/charge-summary.ts').summariseChargesWithPlayerMatchFees([
    {id:'test-charge',fixtureId:'test-fixture',amountPence,status:'PAID',description:'Test league.\nCovered by player shares totalling £40.00.\nAdmin note must remain.',transactions},
  ],fees);
  return {...charge,...summary,settledPence:summary.settledPence??summary.coveredPence,waivedPence:summary.waivedPence??0};
}

test('five displayed contributions equal the canonical £37: £18 cash + £19 adjustments, not £34 or £40',()=>{
  const fees=fixtureFees(),before=JSON.stringify(fees),load=loader();
  const displays=fees.map(f=>load(displayPath).getPlayerPaymentDisplay(f));
  assert.deepEqual(displays.map(d=>d.fixtureContributionPence),[800,800,800,800,500]);
  assert.equal(displays.reduce((s,d)=>s+d.fixtureContributionPence,0),3700);
  assert.equal(displays[3].amountPence,500,'player-facing receipt remains £5, not £8');
  assert.equal(displays[4].review,true);assert.equal(displays[4].adjustmentPence,0,'no invented cap for last player');
  const summary=summaryFor(fees), split=load(presentationPath).getPlayerSettlementBreakdown(summary);
  assert.deepEqual([split.cashPence,split.adjustmentPence,split.totalPence,summary.outstandingPence],[1800,1900,3700,300]);
  assert.equal(summary.displayStatus,'PART_PAID');assert.equal(JSON.stringify(fees),before);
});
test('an explicitly recorded second cap settles £40 without increasing cash',()=>{
  const fees=fixtureFees();fees[4].note=fees[3].note;
  const summary=summaryFor(fees);assert.equal(summary.playerPaidPence,1800);assert.equal(summary.playerSubsidyPence,2200);assert.equal(summary.outstandingPence,0);
  assert.equal(fees.reduce((s,f)=>s+loader()(displayPath).getPlayerPaymentDisplay(f).fixtureContributionPence,0),4000);
});
for(const status of ['OPEN','CANCELLED'])test(`${status} is not a fixture contribution`,()=>{
  const d=loader()(displayPath).getPlayerPaymentDisplay({amountPence:800,status});assert.equal(d.fixtureContributionPence,0);
});
test('money paid to captain is not yet a SIXFL player contribution',()=>{
  const d=loader()(displayPath).getPlayerPaymentDisplay({amountPence:800,status:'WAIVED',note:'captain/organiser marked paid'});
  assert.equal(d.captainReceivedPence,800);assert.equal(d.fixtureContributionPence,0);assert.equal(d.statusLabel,'Paid to captain');
});
test('controlled partial and net refunded receipts retain their true balances with no inferred adjustment',()=>{
  const get=loader()(displayPath).getPlayerPaymentDisplay;
  for(const receivedPence of [800,300,0]) {
    const d=get({amountPence:1200,status:'OPEN',captainAssignedAmountPence:1200},{controlled:true,receivedPence,captainReceivedPence:0,balancePence:1200-receivedPence});
    assert.equal(d.fixtureContributionPence,receivedPence);assert.equal(d.adjustmentPence,0);assert.equal(d.outstandingPence,1200-receivedPence);
  }
});
test('legacy description snapshot is removed only for display; audit and waiver markers are retained',()=>{
  const {getChargeDescriptionForDisplay:get}=loader()(presentationPath);
  const note='Test league.\nCovered by player shares totalling £40.00.\n[TEAM_CHARGE_WAIVER:300] Admin note.';
  assert.equal(get(note),'Test league.\n[TEAM_CHARGE_WAIVER:300] Admin note.');assert.match(note,/£40.00/);
  assert.equal(get('Covered by player payments totalling £1,040.00.'),null);assert.equal(get(null),null);
  assert.equal(get('Admin says: covered by a sponsor; fee £40.00.'),'Admin says: covered by a sponsor; fee £40.00.');
});
test('current status uses canonical settlement, including waivers and excess rather than a false capped equation',()=>{
  const {getCurrentSettlementText:get}=loader()(presentationPath);
  assert.equal(get({amountPence:4000,coveredPence:3700,outstandingPence:300}),'£37.00 applied to £40.00 charge; £3.00 outstanding.');
  assert.match(get({amountPence:4000,coveredPence:3700,settledPence:4000,outstandingPence:0}),/^£40.00 applied.*£0.00 outstanding/);
  assert.match(get({amountPence:4000,coveredPence:4500,settledPence:4500,outstandingPence:0}),/£5.00 settlement above this charge/);
});

async function renderPage({isAdmin=true,mismatch=false,fees=fixtureFees(),creditPence=0,teamPaidPence=0}={}) {
  const transactions=[...(creditPence?[{amountPence:creditPence,notes:'Team credit used',reference:'TEAM_CREDIT'}]:[]),...(teamPaidPence?[{amountPence:teamPaidPence,notes:'Team payment'}]:[])];
  const summary=summaryFor(fees,transactions);
  const entry={...summary,chargeId:'test-charge',teamId:'test-team',teamName:'Test team',fixtureLabel:'Test team vs Opposition',
    leagueName:'Test league',leagueSeason:'Test season',divisionName:null,venueName:null,dueDate:new Date('2026-08-25T18:40:00Z'),kickoffAt:new Date('2026-08-25T18:40:00Z'),
    createdAt:new Date('2026-08-20T12:00:00Z'),title:'Match fee - Test team vs Opposition',paymentToken:'nonfunctional-test-token',
    payments:transactions.map((t,i)=>({...t,id:`transaction-${i}`,paidAt:new Date(),method:'MANUAL',reference:t.reference??null})),
    playerOpenPence:fees.filter(f=>f.status==='OPEN').reduce((s,f)=>s+f.amountPence,0),overpaidPence:0,
    latePaymentFeeStatus:'NONE',latePaymentFeeAmountPence:0,baseMatchFeePence:4000};
  if(mismatch)entry.playerPaidPence+=100;
  const ledger={teamId:'test-team',teamName:'Test team',relatedTeamIds:['test-team'],entries:[entry],openEntries:[entry],outstandingPence:entry.outstandingPence,openChargeCount:entry.outstandingPence?1:0,selectedEntry:entry};
  const db={team:{findUnique:async()=>({id:'test-team',name:'Test team',teamMode:'STANDARD'})},paymentTransaction:{findMany:async()=>[]},
    playerMatchFee:{findMany:async({where})=>fees.filter(f=>typeof where.status==='string'?f.status===where.status:!where.status?.in||where.status.in.includes(f.status))},$queryRaw:async()=>[]};
  const mocks={
    '@/lib/prisma':{prisma:db},
    '@/lib/requireCaptain':{requireCaptain:async()=>({isAdmin,user:{id:'test-actor'}})},
    'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
    'next/cache':{revalidatePath:()=>{throw new Error('No writes during rendering test');}},
    'next/navigation':{notFound:()=>{throw new Error('Not found');},redirect:()=>{throw new Error('Unexpected redirect');}},
    '@/components/captain/TeamKitFundTransferPanel':{__esModule:true,default:()=>null},
    '@/components/payments/TeamPaymentOrderNotice':{TeamPaymentOrderNotice:()=>null},
    '@/lib/datetime/london':{formatDateTimeInLondon:()=> 'Tue 25 Aug, 19:40'},
    '@/lib/kits/kit-fund':{getKitFundLedger:async()=>({entries:[],balancePence:0})},
    '@/lib/payments/team-credits':{getTeamCreditLedger:async()=>({entries:[],balancePence:0})},
    '@/lib/payments/match-day-billing':{isMatchFeeChargePayable:()=>true},
    '@/lib/payments/player-fee-assigned-share':{hydrateCaptainAssignedPlayerFees:async rows=>rows},
    '@/lib/payments/zero-fee-player-adjustments':{reconcileZeroFeePlayerAdjustmentsForTeam:async()=>{}},
    '@/lib/payments/team-payment-ledger':{formatPaymentFixtureDate:()=> 'Tue 25 Aug, 19:40',formatPaymentMoney:money,getTeamPaymentLedger:async()=>ledger},
    '@/lib/payments/team-subscriptions':{getTeamSubscriptionSnapshot:async()=>null},
    '@/lib/payments/team-autopay-snapshot':{getTeamAutoPaySnapshot:async()=>null,isConfirmedTeamAutoPaySetup:()=>false},
    '@/lib/payments/team-payment-order':{getTeamPaymentOrder:async()=>({enabled:false,overdue:[],next:null,decision:()=>({allowed:true})})},
  };
  const before=JSON.stringify(fees);
  const element=await loader(mocks)(pagePath).default({params:Promise.resolve({teamid:'test-team'}),searchParams:Promise.resolve({})});
  const html=renderToStaticMarkup(element);assert.equal(JSON.stringify(fees),before);return html;
}

test('real captain page renders the same contributions, subtotal and current balance; raw stale £40 sentence is absent',async()=>{
  const html=await renderPage();
  const amounts=[...html.matchAll(/data-player-contribution-pence="(\d+)"/g)].map(m=>Number(m[1]));
  assert.deepEqual(amounts,[800,800,800,800,500]);assert.equal(amounts.reduce((a,b)=>a+b,0),3700);
  assert.match(html,/data-player-contributions-total="3700"/);assert.match(html,/data-player-settled-pence="3700"/);
  assert.match(html,/data-player-cash-pence="1800"/);assert.match(html,/data-player-adjustments-pence="1900"/);
  assert.match(html,/£37.00 applied to £40.00 charge; £3.00 outstanding/);assert.doesNotMatch(html,/Covered by player shares totalling/);
  assert.match(html,/Correct original charge/);assert.match(html,/Check balance/);assert.match(html,/Admin note must remain/);
  const out=path.join(process.cwd(),'.tmp/ledger-consistency');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'rendered.html'),html);
});
test('normal captain does not receive admin correction control',async()=>{
  const html=await renderPage({isAdmin:false});assert.doesNotMatch(html,/Correct original charge/);assert.match(html,/Check balance/);
});
test('unmatched records are explicitly flagged, never secretly forced to balance',async()=>{
  const html=await renderPage({mismatch:true});assert.match(html,/The player rows total £37.00, but the fixture ledger records £38.00/);
});
test('team payment and credit are separate from player contribution subtotal',async()=>{
  const html=await renderPage({creditPence:100,teamPaidPence:200});
  assert.match(html,/data-player-settled-pence="3700"/);assert.match(html,/£40.00 applied to £40.00 charge; £0.00 outstanding/);
  assert.match(html,/Team credit used/);assert.match(html,/Team payment/);
});
test('native squad-payment summaries share the full adjustment split and contribution columns do not replace open debts',()=>{
  const s=read('src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx');
  assert.match(s,/Team balance settled — player links remain open/);
  assert.match(s,/Later player payments reduce the waiver first/);
  assert.match(s,/getPlayerSettlementBreakdown\(selectedEntry/);assert.match(s,/getPlayerSettlementBreakdown\(entry\)/);
  assert.doesNotMatch(s,/const captainSettledPence = collectedPence \+ zeroFeeSettledPence/);
  assert.match(read(pagePath),/payment\.outstandingPence/);assert.match(read(pagePath),/getPlayerPaymentDisplay\(fee, playerReceiptStates.get\(fee.id\)\)/);
  assert.doesNotMatch(read(presentationPath),/prisma|\.update\(|\.create\(|fetch\(/);
});

test('actual squad settlement expression preserves historical player cash when no team charge exists',()=>{
  const source=read('src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx');
  const declaration=source.match(/const playerSettlement = ([^\n]+);/)[1];
  const js=ts.transpileModule(`module.exports=(${declaration});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const load=loader(),module={exports:{}};
  const evaluate=new Function('module','selectedEntry','collectedPence','selectedFees','getPlayerPaymentDisplay','getPlayerSettlementBreakdown',js);
  const getDisplay=load(displayPath).getPlayerPaymentDisplay, getSplit=load(presentationPath).getPlayerSettlementBreakdown;
  evaluate(module,null,1800,fixtureFees(),getDisplay,getSplit);
  assert.deepEqual([module.exports.cashPence,module.exports.adjustmentPence,module.exports.totalPence],[1800,1900,3700]);
  evaluate(module,{playerPaidPence:900,playerSubsidyPence:200},1800,fixtureFees(),getDisplay,getSplit);
  assert.equal(module.exports.totalPence,1100,'existing canonical team ledger takes precedence over fallback');
});
