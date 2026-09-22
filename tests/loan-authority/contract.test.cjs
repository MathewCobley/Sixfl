const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
 const mod = {exports:{}};
 const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(id=> id in mocks ? mocks[id] : require(id),mod,mod.exports);
 return mod.exports;
}
const policy = load('src/lib/fixtures/loan-authority-policy.ts');
const input = {fixtureId:'fixture',teamId:'team-a',count:2,revision:0};
test('requests require a whole player count; clearing records zero',()=>{
 assert.deepEqual(policy.parseLoanAuthority(input),input);
 for(const count of [-1,10,1.5,'2',null,NaN]) assert.throws(()=>policy.parseLoanAuthority({...input,count}));
 for(const count of [0,1,9]) assert.equal(policy.parseLoanAuthority({...input,count}).count,count);
 assert.equal(policy.loanAuthorityLabel(0),'');
 assert.equal(policy.loanAuthorityLabel(2),'Loan authority requested: 2');
 assert.throws(()=>policy.parseLoanAuthority({...input,revision:-1}));
});
test('save rejects replaced teams and stale revisions; count and actor are persisted under fixture lock',async()=>{
 let writes=0, previous=[], fixture={homeTeamId:'team-a',awayTeamId:'team-b'};
 const service=load('src/lib/fixtures/loan-authority.ts',{
  './loan-authority-policy':policy,
  '@/lib/prisma':{prisma:{$transaction:fn=>fn({$queryRaw:async query=>{
   if(query.text.includes('FOR UPDATE')) return fixture?[fixture]:[];
   if(query.text.includes('SELECT')) return previous;
   writes++; assert.ok(query.values.includes('admin')); return [{...input,revision:1}];
  }})}},
 });
 await service.saveLoanAuthorityRequest(input,'admin'); assert.equal(writes,1);
 fixture={homeTeamId:'replacement',awayTeamId:'team-b'};
 await assert.rejects(service.saveLoanAuthorityRequest(input,'admin'),/no longer/);
 fixture={homeTeamId:'team-a',awayTeamId:'team-b'}; previous=[{revision:1}];
 await assert.rejects(service.saveLoanAuthorityRequest(input,'admin'),/Someone changed/);
 assert.equal(writes,1);
});
test('admin authentication and same-origin gate run before mutation',async()=>{
 let allowed=false, saves=0;
 const route=load('src/app/api/admin/night-board/loan-authority/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  'next/cache':{revalidatePath(){}},
  '@/lib/requireAdmin':{requireAdmin:async()=>({user:allowed?{id:'admin'}:null})},
  '@/lib/fixtures/loan-authority-policy':policy,
  '@/lib/fixtures/guest-approval-policy':load('src/lib/fixtures/guest-approval-policy.ts'),
  '@/lib/fixtures/loan-authority':{saveLoanAuthorityRequest:async()=>{saves++;return input;}},
 });
 const request=(origin)=>new Request('https://sixfl.co.uk/api/admin/night-board/loan-authority',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)});
 assert.equal((await route.POST(request('https://sixfl.co.uk'))).status,403);
 allowed=true;
 assert.equal((await route.POST(request('https://evil.example'))).status,403);
 assert.equal(saves,0);
 assert.equal((await route.POST(request('https://sixfl.co.uk'))).status,200);
 assert.equal(saves,1);
});
test('prepared Night Board and both print routes retain the shared request source',()=>{
 assert.match(fs.readFileSync('src/app/(admin)/admin/night-board/page.tsx','utf8'),/<NightBoardLoanAuthorityControl/);
 for(const route of ['pitch-tally-sheets','night-fixtures']) {
  const source=fs.readFileSync(`src/app/api/admin/night-board/${route}/route.ts`,'utf8');
  assert.match(source,/await getLoanAuthorityRequests/); assert.match(source,/loanAuthorityLabel\(/);
  assert.match(source,/homeLoanCount/); assert.match(source,/awayLoanCount/);
 }
 const service=fs.readFileSync('src/lib/fixtures/loan-authority.ts','utf8');
 assert.match(service,/r\."teamId" IN \(f\."homeTeamId", f\."awayTeamId"\)/);
 assert.doesNotMatch(service,/GuestApproval|FixtureSelection|TeamMember/);
});
