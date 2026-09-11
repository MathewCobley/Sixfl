const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { build } = require('esbuild');
const ts = require('typescript');
function checkScoreQueries(text, file) {
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 function visit(node) {
  if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='result'&&ts.isObjectLiteralExpression(node.initializer)) {
   const select=node.initializer.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='select');
   if(select&&ts.isObjectLiteralExpression(select.initializer)) {
    const body=select.initializer.getText(source);
    if(/(?:homeScore|awayScore):\s*true/.test(body))assert.ok(body.includes('RESULT_SCORE_SELECT')||(body.includes('originalHomeScore')&&body.includes('originalAwayScore')&&body.includes('overturnedAt')),file+' drops original score metadata');
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
let route, Notice;
const state = { session: null, actor: null, calls: [] };
global.__overturnBoundary = state;
before(async () => {
 const stubs = {
  'next-auth': 'export const getServerSession=async()=>global.__overturnBoundary.session;',
  '@/auth': 'export const authOptions={};',
  '@/lib/prisma': 'export const prisma={user:{findUnique:async()=>global.__overturnBoundary.actor}};',
  'next/cache': 'export const revalidatePath=()=>{};',
  '@/lib/results/overturn-result': `export class ResultOverturnError extends Error {constructor(m,status=400){super(m);this.status=status;}} export async function previewResultOverturn(i){global.__overturnBoundary.calls.push(i);return{token:'bound-token'};} export async function confirmResultOverturn(i){global.__overturnBoundary.calls.push(i);if(!i.confirmed)throw new ResultOverturnError('Confirm the decision');return{fixtureId:i.fixtureId,leagueSlug:'test'};}`,
 };
 const result = await build({entryPoints:['src/app/api/admin/fixtures/[id]/overturn/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'boundary',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
 fs.writeFileSync('.overturn-route.cjs',result.outputFiles[0].contents);route=require('../.overturn-route.cjs');
 const notice = await build({entryPoints:['src/components/results/ResultOverturnNotice.tsx'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});
 fs.writeFileSync('.overturn-notice.cjs',notice.outputFiles[0].contents);Notice=require('../.overturn-notice.cjs').default;
});
after(()=>{for(const p of ['.overturn-route.cjs','.overturn-notice.cjs'])fs.rmSync(p,{force:true});delete global.__overturnBoundary;});
const request=(body,origin='https://sixfl.example')=>new Request('https://sixfl.example/api/admin/fixtures/fixture-one/overturn',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const call=req=>route.POST(req,{params:Promise.resolve({id:'fixture-one'})});
test('endpoint rejects absent sessions and forged admin roles',async()=>{
 for(const role of [null,'USER','REFEREE']){state.calls=[];state.session=role?{user:{email:'user@example.invalid'}}:null;state.actor=role?{id:'user',role}:null;assert.equal((await call(request({action:'confirm',confirmed:true,isAdmin:true,actorUserId:'admin'}))).status,403);assert.equal(state.calls.length,0);}
});
test('endpoint rejects cross-site or non-JSON callers before invoking the decision service',async()=>{
 state.calls=[];state.actor={id:'admin',role:'ADMIN'};state.session={user:{email:'admin@example.invalid'}};
 assert.equal((await call(request({action:'preview'},'https://attacker.example'))).status,403);
 const req=request({action:'preview'});req.headers.set('sec-fetch-site','cross-site');assert.equal((await call(req)).status,403);assert.equal(state.calls.length,0);
});
test('real endpoint binds actor and fixture to authentication and route, not submitted fields',async()=>{
 state.calls=[];state.actor={id:'real-admin',role:'ADMIN'};state.session={user:{email:'admin@example.invalid'}};
 const r=await call(request({action:'preview',actorUserId:'forged',fixtureId:'wrong',winnerTeamId:'b',reasonCode:'PLAYER_LIMIT',decisionReason:'Reviewed evidence',evidenceReference:'TEST',rulesBasis:'Test rules'}));assert.equal(r.status,200);
 assert.equal(state.calls[0].actorUserId,'real-admin');assert.equal(state.calls[0].fixtureId,'fixture-one');
 await call(request({action:'confirm',confirmed:true,token:'bound-token',winnerTeamId:'forged-winner',originalHomeScore:100}));
 assert.deepEqual(state.calls[1],{fixtureId:'fixture-one',actorUserId:'real-admin',token:'bound-token',confirmed:true});
 assert.equal((await call(request({action:'confirm',token:'bound-token'}))).status,400);
});
test('configured public origin remains valid behind Railway proxy',async()=>{
 const old=process.env.NEXTAUTH_URL;process.env.NEXTAUTH_URL='https://sixfl.example';
 try{assert.equal((await call(new Request('http://localhost:8080/api/admin/fixtures/fixture-one/overturn',{method:'POST',headers:{origin:'https://sixfl.example','content-type':'application/json'},body:JSON.stringify({action:'preview'})}))).status,200);}
 finally{if(old===undefined)delete process.env.NEXTAUTH_URL;else process.env.NEXTAUTH_URL=old;}
});
test('public shared notice shows both score meanings but no private evidence or actor',()=>{
 const props={result:{homeScore:0,awayScore:3,originalHomeScore:4,originalAwayScore:1,overturnedAt:new Date(),decisionReason:'SECRET REASON',evidenceReference:'PRIVATE WITNESS'},homeName:'Test A',awayName:'Test B',decidedByUserId:'SECRET ACTOR'};
 const html=renderToStaticMarkup(React.createElement(Notice,props));
 assert.match(html,/Awarded · Result overturned by SIXFL/);assert.match(html,/4/);assert.match(html,/1/);assert.doesNotMatch(html,/SECRET|PRIVATE WITNESS/);
 assert.equal(renderToStaticMarkup(React.createElement(Notice,{result:{homeScore:3,awayScore:0}})),'');
});
test('native public, captain, player, referee and admin consumers retain shared notices after prebuild',()=>{
 const views=['src/app/(public)/leagues/[slug]/results/page.tsx','src/app/(public)/leagues/[slug]/fixtures/page.tsx','src/app/(public)/leagues/[slug]/page.tsx','src/app/(public)/teams/[id]/page.tsx','src/app/captain/team/[teamid]/page.tsx','src/app/captain/team/[teamid]/fixtures/page.tsx','src/app/captain/team/[teamid]/results/page.tsx','src/app/captain/team/[teamid]/results-history/page.tsx','src/app/player/team/[teamid]/page.tsx','src/app/(public)/referee/fixture/[id]/page.tsx','src/app/(admin)/admin/fixtures/[id]/result/page.tsx'];
 for(const p of views){const text=fs.readFileSync(p,'utf8');assert.ok(text.includes('<ResultOverturnNotice'),p);assert.ok(text.includes('RESULT_SCORE_SELECT')||text.includes('overturnedAt')||text.includes('result: {\n'),p);assert.ok(!text.includes('overturn: true'),p+' must not fetch private relation');checkScoreQueries(text,p);}
 const admin=fs.readFileSync('src/app/(admin)/admin/fixtures/[id]/overturn/page.tsx','utf8');assert.ok(admin.includes('requireAdmin()'));assert.ok(admin.includes('access.user.role !== "ADMIN"'));
 const editor=fs.readFileSync('src/app/(admin)/admin/fixtures/[id]/result/page.tsx','utf8');assert.ok(editor.includes('!fixture.result?.overturnedAt'));assert.ok(editor.includes('confirmCompletedResultChange'));
});
test('every prediction history query and accuracy reader preserves on-pitch data; standings remain official',()=>{
 const producers=['src/lib/fixtures/storedAiPredictions.ts','src/lib/fixtures/recoverHistoricalAiPredictions.ts','src/app/api/leagues/[slug]/win-chances/route.ts','src/app/api/captain/team/[teamid]/fixture-badges/route.ts','src/app/(public)/leagues/[slug]/fixtures/page.tsx','src/app/api/admin/night-board/night-fixtures/route.ts','src/app/api/admin/night-board/pitch-sheets/route.ts','src/app/api/admin/night-board/pitch-tally-sheets/route.ts'];
 for(const p of producers){const text=fs.readFileSync(p,'utf8');assert.ok(text.includes('...RESULT_SCORE_SELECT'),p);assert.doesNotMatch(text,/result:\s*\{\s*select:\s*\{\s*homeScore:\s*true,\s*awayScore:\s*true\s*\}/,p);}
 for(const p of ['src/app/(admin)/admin/ai-predictor/page.tsx','src/app/(admin)/admin/ai-predictor/backtest/page.tsx']){const text=fs.readFileSync(p,'utf8');assert.ok(text.includes('ELSE result."originalHomeScore" END'));assert.ok(text.includes('ELSE result."originalAwayScore" END'));}
 const table=fs.readFileSync('src/lib/leagueTable.ts','utf8');assert.ok(table.includes('const homeScore = fixture.result.homeScore'));assert.ok(!table.includes('getOnPitchResult'));
 const core=fs.readFileSync('src/lib/results/overturn-result.ts','utf8');assert.ok(!/queueNotification|sendEmail|stripe|refreshStoredAiPreview/.test(core));
 assert.ok(!fs.existsSync('.github/workflows/author-result-overturn-once.yml'));
});
