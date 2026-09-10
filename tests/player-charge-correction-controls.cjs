const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {build}=require('esbuild');
let route;const state={user:null,session:null,calls:[]};global.__correctionBoundary=state;
before(async()=>{
 const result=await build({entryPoints:['src/app/api/admin/player-fees/[feeId]/correct-charge/route.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'isolated-auth',setup(b){
  const replacements={
   'next-auth':'export async function getServerSession(){return global.__correctionBoundary.session}',
   '@/auth':'export const authOptions={}',
   '@/lib/prisma':'export const prisma={user:{async findUnique(){return global.__correctionBoundary.user}}}',
   'next/cache':'export function revalidatePath(){}',
   '@/lib/payments/player-charge-correction':`export class PlayerChargeCorrectionError extends Error {constructor(m,status=400){super(m);this.status=status}}; export async function previewOriginalPlayerCharge(i){global.__correctionBoundary.calls.push(i);return {token:'signed'};} export async function confirmOriginalPlayerCharge(i){global.__correctionBoundary.calls.push(i);return {teamId:'t',feeId:i.feeId,outstandingPence:400};}`,
   '@/lib/payments/player-ledger':'export function parseLedgerMoney(v){return Number(v)*100}',
  };b.onResolve({filter:/.*/},a=>Object.hasOwn(replacements,a.path)?{path:a.path,namespace:'stub'}:undefined);
  b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:replacements[a.path],loader:'js'}));
 }}]});fs.writeFileSync('.correction-boundary.cjs',result.outputFiles[0].contents);route=require('../.correction-boundary.cjs');
});after(()=>{fs.rmSync('.correction-boundary.cjs',{force:true});delete global.__correctionBoundary});
const request=(body,origin='https://sixfl.example')=>new Request('https://sixfl.example/api/admin/player-fees/fee-one/correct-charge',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('real correction endpoint denies absent sessions and forged captain admin flags',async()=>{
 for(const role of [null,'USER','REFEREE']){state.calls=[];state.session=role?{user:{email:'captain@example.invalid'}}:null;state.user=role?{id:'captain',role}:null;
  const r=await route.POST(request({action:'preview',isAdmin:true,actorUserId:'admin',originalAmount:'12'}),{params:Promise.resolve({feeId:'fee-one'})});assert.equal(r.status,403);assert.equal(state.calls.length,0);}
});
test('real correction endpoint rejects cross-origin requests before touching accounting',async()=>{
 state.calls=[];state.session={user:{email:'admin@example.invalid'}};state.user={id:'admin',role:'ADMIN'};
 const r=await route.POST(request({action:'confirm',confirmed:true,token:'x'},'https://attacker.example'),{params:Promise.resolve({feeId:'fee-one'})});assert.equal(r.status,403);assert.equal(state.calls.length,0);
});
test('real correction endpoint takes actor and fee from authentication/route, never submitted ids',async()=>{
 state.calls=[];state.session={user:{email:'admin@example.invalid'}};state.user={id:'real-admin',role:'ADMIN'};
 const r=await route.POST(request({action:'preview',actorUserId:'forged',feeId:'another',originalAmount:'12',reason:'Historical correction',noWaiver:true}),{params:Promise.resolve({feeId:'fee-one'})});assert.equal(r.status,200);
 assert.equal(state.calls[0].actorUserId,'real-admin');assert.equal(state.calls[0].feeId,'fee-one');assert.equal(state.calls[0].originalPence,1200);
 state.calls=[];const blocked=await route.POST(request({action:'confirm',token:'x'}),{params:Promise.resolve({feeId:'fee-one'})});assert.equal(blocked.status,400);assert.equal(state.calls.length,0);
});
test('all three native admin entry points survive production preparation; no public correction action',()=>{
 // Team Payments now owns the link through PlayerContributionTable. Verify
 // the import, authenticated prop handoff and the actual guarded link, rather
 // than demanding the link's literal text still live in the parent file.
 const payments=fs.readFileSync('src/app/captain/team/[teamid]/payments/page.tsx','utf8');
 assert.match(payments,/import\s*\{[^}]*PlayerContributionTable[^}]*\}\s*from\s*["']@\/components\/payments\/PaymentLedgerReconciliation["']/);
 assert.match(payments,/<PlayerContributionTable\s+rows=\{playerCollectionDetails\}\s+isAdmin=\{correctionAccess\.isAdmin\}\s*\/>/);
 const table=fs.readFileSync('src/components/payments/PaymentLedgerReconciliation.tsx','utf8');
 assert.match(table,/isAdmin\s*&&\s*row\.statusLabel\s*===\s*"Check balance"\s*\?\s*<Link\s+href=\{`\/admin\/payments\/player-fees\/\$\{row\.id\}\/correct-charge`\}/);
 assert.ok(table.includes('Correct original charge'));
 for(const path of ['src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx','src/app/captain/team/[teamid]/player-payments/account/[feeId]/page.tsx']){
  const s=fs.readFileSync(path,'utf8');assert.ok(s.includes('correctionAccess.isAdmin'));assert.ok(s.includes('Correct original charge'));assert.ok(s.includes('/correct-charge'));}
 const s=fs.readFileSync('src/app/api/admin/player-fees/[feeId]/correct-charge/route.ts','utf8');assert.ok(s.includes('getServerSession(authOptions)'));assert.ok(s.includes('user.role !== "ADMIN"'));
 const page=fs.readFileSync('src/app/(admin)/admin/payments/player-fees/[feeId]/correct-charge/page.tsx','utf8');assert.ok(page.includes('requireAdmin()'));assert.ok(page.includes('access.user.role !== "ADMIN"'));
 const core=fs.readFileSync('src/lib/payments/player-charge-correction.ts','utf8');assert.ok(core.includes('assertPlayerChargeCorrectionAdmin(input.actorUserId, db)'));assert.ok(!core.includes('paymentTransaction.create('));assert.ok(!core.includes('queueNotification'));assert.ok(!core.includes('refunds.create'));assert.ok(!core.includes('sessions.create'));
});

test('configured public origin works behind Railway without accepting cross-site callers',async()=>{
 const old=process.env.NEXTAUTH_URL;process.env.NEXTAUTH_URL='https://sixfl.example';
 state.calls=[];state.session={user:{email:'admin@example.invalid'}};state.user={id:'real-admin',role:'ADMIN'};
 try{
  const req=new Request('http://localhost:8080/api/admin/player-fees/fee-one/correct-charge',{method:'POST',headers:{origin:'https://sixfl.example','content-type':'application/json'},body:JSON.stringify({action:'preview',originalAmount:'12',reason:'Historical correction',noWaiver:true})});
  assert.equal((await route.POST(req,{params:Promise.resolve({feeId:'fee-one'})})).status,200);assert.equal(state.calls.length,1);
  const cross=request({action:'confirm',token:'x',confirmed:true});cross.headers.set('sec-fetch-site','cross-site');
  assert.equal((await route.POST(cross,{params:Promise.resolve({feeId:'fee-one'})})).status,403);assert.equal(state.calls.length,1);
 }finally{if(old===undefined)delete process.env.NEXTAUTH_URL;else process.env.NEXTAUTH_URL=old;}
});
