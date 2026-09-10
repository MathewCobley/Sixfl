const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const api='src/app/api/admin/payments/recent-details/route.ts';
const helper='src/lib/payments/payment-receipt-presentation.ts';
const read=p=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
function harness({authorised=true,transactions=[],fees=[]}={}){
  let reads=0;
  const db={paymentTransaction:{findMany:async()=>{reads++;return transactions;}},playerMatchFee:{findMany:async({where})=>{reads++;return fees.filter(f=>where.id.in.includes(f.id));}}};
  const mocks={
    '@/lib/prisma':{prisma:db},
    '@/lib/requireAdmin':{requireAdmin:async()=>{if(!authorised)throw new Error('UNAUTHORIZED');}},
    'next/server':{NextResponse:Response},
    '@/lib/datetime/london':{formatDateTimeInLondon:()=> '09 Sept 2026 10:10'},
  };
  const allowed=new Set([api,helper,'src/lib/payments/player-ledger-markers.ts','src/lib/payments/charge-summary.ts','src/lib/payments/player-fee-coverage.ts','src/lib/payments/team-charge-waivers.ts']);
  const cache=new Map();
  function load(file){
    if(!path.extname(file))file+='.ts';assert.ok(allowed.has(file),`Unexpected dependency ${file}`);
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const js=ts.transpileModule(read(file),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
    new Function('require','module','exports','fetch',js)(id=>{
      let alias=id;if(id.startsWith('.'))alias='@/'+path.posix.normalize(path.posix.join(path.posix.dirname(file),id)).replace(/^src\//,'').replace(/\.ts$/,'');
      if(Object.hasOwn(mocks,alias))return mocks[alias];
      if(id==='@prisma/client')return require(id);
      if(alias.startsWith('@/'))return load('src/'+alias.slice(2));
      throw new Error(`Unmocked dependency ${id}`);
    },module,module.exports,()=>{throw new Error('Provider/network calls forbidden');});
    return module.exports;
  }
  return {GET:load(api).GET,reads:()=>reads};
}
function fixture(){
  const team={id:'synthetic-team',name:'Synthetic team',contactName:'Captain',contactEmail:'captain@example.invalid',contactPhone:null,league:{id:'league',name:'Test league',season:'Test'}};
  const fixture={id:'fixture',kickoffAt:new Date('2026-09-08T19:00:00Z'),homeTeam:{name:'Synthetic team'},awayTeam:{name:'Opposition'},league:{name:'Test league',season:'Test'}};
  const fees=Array.from({length:4},(_,i)=>({id:`fee-${i}`,amountPence:500,team,fixture,teamMember:{user:{name:`Synthetic player ${i+1}`,email:`player-${i}@example.invalid`}},prospect:null}));
  const transactions=fees.map((fee,i)=>({id:`payment-${i}`,teamId:team.id,team,amountPence:600,method:'STRIPE',reference:`synthetic-receipt-${i}`,paidAt:new Date('2026-09-09T09:10:00Z'),
    notes:`Player ledger repayment. Account fee reference: ${fee.id}. Request: synthetic-${i}.`,charge:{id:'charge',title:'Synthetic fixture charge',description:null,fixture}}));
  return {fees,transactions};
}
const request=query=>new Request('https://example.invalid/api/admin/payments/recent-details'+(query?'?'+query:''));

test('admin recent-details API names all four modern player receipts even above a later nominal fee',async()=>{
  const data=fixture(),before=JSON.stringify(data);const h=harness(data);const response=await h.GET(request());assert.equal(response.status,200);
  const {details}=await response.json();assert.equal(details.length,4);assert.ok(details.every(d=>d.typeLabel==='Player match fee'));
  assert.match(details[0].title,/Synthetic player 1 paid £6.00/);assert.match(details[0].line1,/Synthetic team vs Opposition/);
  assert.equal(JSON.stringify(data),before);assert.equal(h.reads(),2);
});
test('admin history preserves legacy whole-team routing while modern refunds remain player refunds',async()=>{
  const data=fixture();data.transactions[0].notes='Player match fee paid online. Player fee ID: fee-0.';
  data.transactions[1].amountPence=-200;data.transactions[1].notes='Player ledger repayment refund. Account fee reference: fee-1. Request: synthetic-1.';
  const {details}=await (await harness(data).GET(request())).json();assert.equal(details[0].typeLabel,'Team fixture payment');
  assert.equal(details[1].typeLabel,'Player refund');assert.match(details[1].title,/Synthetic player 2 refunded £2.00/);assert.equal(details[1].amountLabel,'-£2.00');
});
test('admin receipt provenance supports the existing name/team/league search filters without writes',async()=>{
  const data=fixture();const {details}=await (await harness(data).GET(request('q=Synthetic+player+3&teamId=synthetic-team&leagueId=league'))).json();
  assert.equal(details.length,1);assert.equal(details[0].id,'payment-2');
  assert.equal((await (await harness(data).GET(request('teamId=another-team'))).json()).details.length,0);
});
test('admin receipt-history authorization runs before any data read',async()=>{
  const h=harness({authorised:false});await assert.rejects(h.GET(request()),/UNAUTHORIZED/);assert.equal(h.reads(),0);
});
test('native admin page and API both retain the shared receipt presentation after prebuild',()=>{
  const page=read('src/app/(admin)/admin/payments/page.tsx');assert.match(page,/getPaymentReceiptLabel\(payment\)/);assert.match(page,/getPaymentReceiptKind\(payment\)/);
  for(const file of [api,'src/app/captain/team/[teamid]/payments/page.tsx']){
    const source=read(file);assert.match(source,/getPaymentReceiptPlayerFeeId as extractPlayerFeeId/);assert.doesNotMatch(source,/function extractPlayerFeeId\(/);
  }
  assert.doesNotMatch(read(api),/function isPlayerFeePaymentNotes\(/);
});
