const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let rows = [], calls = [], authorised = true, queryError = null;
const read = file => fs.readFileSync(file, 'utf8');
const SRC = 'PLAYER_MATCH_FEE_WARNING';
function row(changes = {}) { return { id: 'warning-one', sourceId: 'fee-one', sourceType: SRC, status: 'SENT', channel: 'EMAIL', createdAt: new Date('2026-09-08T11:28:00Z'), scheduledFor: new Date('2026-09-08T11:28:00Z'), sentAt: new Date('2026-09-08T11:30:00Z'), failedAt: null, cancelledAt: null, providerMessageId: 'provider-one', failureReason: null, metadata: { warningDeadline: '2026-09-10T17:00:00Z' }, ...changes }; }
const db = { notificationDispatch: { async findMany(args) {
  calls.push(args); if(queryError) throw queryError;
  const match = value => typeof args.where.sourceId === 'string' ? value === args.where.sourceId : args.where.sourceId.in.includes(value);
  const filtered = rows.filter(r => r.sourceType === args.where.sourceType && match(r.sourceId)).sort((a,b) => b.createdAt-a.createdAt || b.id.localeCompare(a.id));
  const seen = new Set(); const selected = args.distinct ? filtered.filter(r => { if(seen.has(r.sourceId)) return false; seen.add(r.sourceId); return true; }) : filtered;
  return selected.slice(0,args.take ?? selected.length);
} } };
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const js = ts.transpileModule(read(file), {fileName:file, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  function req(id) {
    if(id === '@/lib/prisma') return { prisma: db };
    if(id === '@/lib/requireAdmin') return { requireAdmin:async()=>{if(!authorised)throw new Error('Unauthorised');return {user:{id:'admin'}};} };
    if(id === '@/lib/payments/player-payment-warning') return {loadPlayerPaymentWarningTarget:async()=>null};
    if(id === '@/components/admin/payments/PlayerPaymentWarningForm') return { __esModule:true, default:()=>{throw new Error('History must not trigger the send form');} };
    if(id === 'next/link') return {__esModule:true,default:props=>require('react').createElement('a',props,props.children)};
    if(id === 'next/navigation') return {useRouter:()=>({refresh(){throw new Error('Render must not refresh');}})};
    if(id.startsWith('@/') || id.startsWith('.')) {
      const base=id.startsWith('@/')?'src/'+id.slice(2):path.join(path.dirname(file),id);
      const resolved=[base,base+'.ts',base+'.tsx'].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
      if(resolved)return load(resolved);
    }
    return require(id);
  }
  new Function('require','module','exports',js)(req,module,module.exports);return module.exports;
}
const history = load('src/lib/payments/player-payment-warning-history.ts');
beforeEach(()=>{rows=[];calls=[];authorised=true;queryError=null;});

test('batch reads exact visible fee IDs, excludes ordinary chases and does not mix two fees for one player',async()=>{
  rows=[row(),row({id:'other-fee-warning',sourceId:'fee-two',channel:'SMS'}),row({id:'chase',sourceType:'PLAYER_MATCH_FEE_CHASE_72H',createdAt:new Date('2026-09-09Z')}),row({id:'not-visible',sourceId:'fee-three'})];
  const result=await history.getLatestPlayerPaymentWarnings(['fee-one','fee-two','fee-one','']);
  assert.deepEqual([...result.keys()].sort(),['fee-one','fee-two']); assert.equal(result.get('fee-one').id,'warning-one');assert.equal(result.get('fee-two').channel,'SMS');
  assert.equal(calls.length,1); assert.deepEqual(calls[0].distinct,['sourceId']); assert.deepEqual(calls[0].where.sourceId.in,['fee-one','fee-two']);
  assert.equal(calls[0].where.sourceType,SRC);assert.deepEqual(calls[0].orderBy,[{createdAt:'desc'},{id:'desc'}]);
  assert.ok(!('bodyText' in calls[0].select));assert.ok(!('recipient' in calls[0].select));
});
test('empty or hidden fee lists do no database work',async()=>{
  assert.equal((await history.getLatestPlayerPaymentWarnings([])).size,0);assert.deepEqual(await history.getPlayerPaymentWarningHistory(''),[]);assert.equal(calls.length,0);
});
test('old warning dispatches appear without resending, fee timestamp updates or a rollout date cutoff',async()=>{
  rows=[row({createdAt:new Date('2025-01-01T12:00:00Z'),sentAt:new Date('2025-01-01T12:05:00Z')})];
  const original=structuredClone(rows);const result=await history.getLatestPlayerPaymentWarnings(['fee-one']);
  assert.equal(result.get('fee-one').label,'Warning sent');assert.match(result.get('fee-one').timestamp,/12:05/);assert.deepEqual(rows,original);assert.ok(!calls[0].where.createdAt);
});
test('queued and processing are not labelled sent; sent uses the real send time rather than creation time',()=>{
  const sent=history.describePlayerPaymentWarning(row());assert.match(sent.timestamp,/12:30.*BST/);assert.doesNotMatch(sent.timestamp,/12:28/);assert.match(sent.deadline,/18:00.*BST/);assert.match(sent.detail,/not confirmed/);
  const queued=history.describePlayerPaymentWarning(row({status:'QUEUED',sentAt:null,providerMessageId:null}));assert.equal(queued.label,'Warning queued');assert.match(queued.detail,/Not yet sent/);assert.match(queued.timestamp,/12:28/);
  const processing=history.describePlayerPaymentWarning(row({status:'PROCESSING',sentAt:null,providerMessageId:null}));assert.equal(processing.label,'Warning sending');assert.match(processing.detail,/not yet confirmed sent/);
});
test('provider failure after submission wins over a stored sent timestamp',()=>{
  const failed=history.describePlayerPaymentWarning(row({status:'FAILED',failedAt:new Date('2026-09-08T11:31:00Z'),failureReason:'Mailbox rejected'}));
  assert.equal(failed.label,'Warning failed');assert.equal(failed.tone,'problem');assert.match(failed.timestamp,/12:31/);assert.equal(failed.failureReason,'Mailbox rejected');
  assert.equal(history.describePlayerPaymentWarning(row({status:'CANCELLED'})).label,'Warning cancelled');assert.equal(history.describePlayerPaymentWarning(row({status:'SKIPPED'})).label,'Warning skipped');
});
test('incomplete provider records ask for review, malformed deadlines do not crash, and missing sent time is honest',()=>{
  assert.equal(history.describePlayerPaymentWarning(row({status:'PROCESSING',sentAt:null})).label,'Warning delivery needs review');
  for(const metadata of [null,[],{}, {warningDeadline:12},{warningDeadline:'nonsense'}])assert.equal(history.describePlayerPaymentWarning(row({metadata})).deadline,null);
  assert.match(history.describePlayerPaymentWarning(row({sentAt:null})).timestamp,/time not recorded/);
});
test('latest request shows failed or queued attempts instead of hiding them behind an older success',async()=>{
  rows=[row(),row({id:'later',status:'FAILED',createdAt:new Date('2026-09-09T11:28:00Z')})];
  assert.equal((await history.getLatestPlayerPaymentWarnings(['fee-one'])).get('fee-one').label,'Warning failed');
  const full=await history.getPlayerPaymentWarningHistory('fee-one');assert.deepEqual(full.map(r=>r.id),['later','warning-one']);assert.equal(calls[1].take,10);assert.equal(calls[1].where.sourceId,'fee-one');
});
test('database failures are not misreported as no warnings requested',async()=>{
  queryError=new Error('Unavailable');await assert.rejects(()=>history.getLatestPlayerPaymentWarnings(['fee-one']),/Unavailable/);
});
test('actual status component shows channel, deadline, direct queue link and escaped failure details',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const Status=load('src/components/admin/payments/PlayerPaymentWarningStatus.tsx').default;
  const html=renderToStaticMarkup(React.createElement(Status,{feeId:'fee/one',showHistoryLink:true,warning:history.describePlayerPaymentWarning(row({status:'FAILED',failureReason:'<script>bad</script>'}))}));
  assert.match(html,/Warning failed/);assert.match(html,/Email/);assert.match(html,/Payment deadline:/);assert.match(html,/fee%2Fone#warning-history/);assert.match(html,/\/admin\/queue\/warning-one/);assert.doesNotMatch(html,/<script>/);
  assert.match(renderToStaticMarkup(React.createElement(Status,{feeId:'fee-one'})),/none requested/);assert.equal(calls.length,0);
});
test('actual warning-history page authorizes before querying and uses the same real status component',async()=>{
  const {renderToStaticMarkup}=require('react-dom/server');const Page=load('src/app/(admin)/admin/payments/player-warning/page.tsx').default;
  authorised=false;await assert.rejects(()=>Page({searchParams:Promise.resolve({feeId:'fee-one'})}),/Unauthorised/);assert.equal(calls.length,0);
  authorised=true;rows=[row()];const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({feeId:'fee-one'})}));
  assert.match(html,/Warning sent/);assert.match(html,/warning-history/);assert.match(html,/Refresh warning status/);assert.equal(calls.length,1);
});
test('main card wiring and successful confirmation invalidate the parent list without rewriting chase or payment state',()=>{
  const page=read('src/app/(admin)/admin/payments/page.tsx'), actions=read('src/app/(admin)/admin/payments/player-warning/actions.ts');
  assert.match(page,/getLatestPlayerPaymentWarnings\(showPlayerFees \? visibleOpenPlayerFees\.map\(fee => fee\.id\) : \[\]\)/);
  assert.match(page,/<PlayerPaymentWarningStatus feeId=\{fee.id\} warning=\{latestPlayerWarnings.get\(fee.id\)\} showHistoryLink \/>/);
  assert.match(page,/formatLastChasedLabel\(fee.lastChasedAt\)/);assert.match(page,/Chase player/);assert.match(page,/Send payment warning/);
  assert.match(actions,/revalidatePath\("\/admin\/payments"\)/);assert.match(actions,/revalidatePath\("\/admin\/payments\/player-warning"\)/);
  const service=read('src/lib/payments/player-payment-warning-history.ts');assert.doesNotMatch(service,/\.update\(|\.create\(|\.upsert\(|queueNotification|processNotificationQueue|lastChasedAt\s*:/);
});
