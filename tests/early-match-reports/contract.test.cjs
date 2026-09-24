const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Prisma } = require('@prisma/client');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require','module','exports',code)(id => {
    if (id in mocks) return mocks[id];
    if (id.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    return require(id);
  },mod,mod.exports);
  return mod.exports;
}
const members = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, user: { name: `Player ${i}`, email: null } }));
const earlyFile = 'src/lib/match-reports/early.ts';
const { readEarlyReport, getEarlyMatchReportCutoff } = load(earlyFile, { '@/lib/prisma': { prisma: {} } });
test('before a score exists, goals, assists, appearances, ratings and PoM save independently of any score', () => {
  const form = new FormData(); form.set('scorerGoals_m0','7'); form.set('ownGoals','2'); form.set('assists_m1','2'); form.set('rating_m2','9.2'); form.set('playerOfMatchTeamMemberId','m3');
  const report = readEarlyReport(form,members);
  assert.equal(report.contributions[0].goals,7); assert.equal(report.ownGoals,2); assert.equal(report.performances.length,4);
  assert.equal(report.performances[2].rating,9.2); assert.equal(report.playerOfMatchName,'Player 3');
});
test('invalid contributions, ratings, outsiders and more than nine players remain rejected', () => {
  for (const [field,value] of [['scorerGoals_m0','-1'],['scorerGoals_m0','1.2'],['ownGoals','-1'],['ownGoals','1.2'],['assists_m0','NaN'],['rating_m0','10.1'],['rating_m0','9.25'],['playerOfMatchTeamMemberId','outsider']]) {
    const form = new FormData(); form.set(field,value); assert.throws(() => readEarlyReport(form,members));
  }
  const form = new FormData(); members.forEach(member => form.set(`played_${member.id}`,'on'));
  assert.throws(() => readEarlyReport(form,members),/maximum of 9/);
});
test('pending score renders no zero-goal HTML cap, established score still caps inputs', () => {
  const Fields = load('src/components/captain/MatchDetailsPlayerFields.tsx').default;
  const players=[{ id:'m0',name:'Player',role:'PLAYER',email:null,played:true,goals:7,assists:1,rating:null }];
  let html=renderToStaticMarkup(React.createElement(Fields,{players,goalsFor:null}));
  assert.doesNotMatch(html.match(/<input[^>]*name="scorerGoals_m0"[^>]*>/)[0],/max=/);
  html=renderToStaticMarkup(React.createElement(Fields,{players,goalsFor:3}));
  assert.match(html.match(/<input[^>]*name="scorerGoals_m0"[^>]*>/)[0],/max="3"/);
});
test('server rejects future, unpublished, cancelled, postponed, foreign, stale-new fixtures and result-arrival race before writing', async () => {
  const base={id:'f',homeTeamId:'a',awayTeamId:'b',kickoffAt:new Date(Date.now()-60*60*1000),publishedAt:new Date(Date.now()-60*60*1000),status:'SCHEDULED',result:null,league:{publicAt:new Date(Date.now()-60*60*1000)}};
  let fixture=base; let writes=0; let locks=0;
  let existingReport=null;
  const tx={ $queryRaw: async () => { locks++; return []; }, fixture:{findUnique:async()=>fixture}, teamMember:{findMany:async()=>members}, fixtureMatchReport:{findUnique:async()=>existingReport,upsert:async()=>{writes++;}} };
  const { saveEarlyMatchReport }=load(earlyFile,{'@/lib/prisma':{prisma:{$transaction:async callback=>callback(tx)}}});
  for(const patch of [{league:{publicAt:null}},{league:{publicAt:new Date(Date.now()+86400000)}},{kickoffAt:new Date(Date.now()+86400000)},{publishedAt:null},{status:'CANCELLED'},{status:'POSTPONED'},{homeTeamId:'c',awayTeamId:'d'},{result:{id:'r'}},{kickoffAt:new Date(Date.now()-8*24*60*60*1000)}]){
    fixture={...base,...patch}; existingReport=null; await assert.rejects(saveEarlyMatchReport('a','f',new FormData()));
  }
  assert.equal(writes,0); assert.equal(locks,9);
  fixture=base; existingReport=null; await saveEarlyMatchReport('a','f',new FormData()); assert.equal(writes,1);
  fixture={...base,kickoffAt:new Date(Date.now()-8*24*60*60*1000)}; existingReport={id:'existing'}; await saveEarlyMatchReport('a','f',new FormData()); assert.equal(writes,2);
});
test('early report action authenticates; both admin entry surfaces retain shared warning component after prebuild',()=>{
  const component=fs.readFileSync('src/components/captain/EarlyMatchReports.tsx','utf8');
  assert.ok(component.indexOf('await requireCaptain(teamId)')<component.indexOf('await saveEarlyMatchReport'));
  assert.match(component,/getEarlyMatchReportCutoff/);
  assert.match(component,/kickoffAt: \{ gte: recentCutoff, lte: now \}/);
  assert.match(component,/earlyReports: \{ some: \{ teamId \} \}/);
  assert.match(component,/result: \{ is: null \}/); assert.match(component,/Awaiting official result/);
  assert.match(fs.readFileSync('src/app/captain/team/[teamid]/results/page.tsx','utf8'),/<EarlyMatchReports/);
  for(const file of ['src/app/(admin)/admin/results/page.tsx','src/app/(admin)/admin/fixtures/page.tsx','src/app/(admin)/admin/fixtures/[id]/result/page.tsx']) assert.match(fs.readFileSync(file,'utf8'),/<MatchReportWarnings/);
  const migration=fs.readFileSync('prisma/migrations/20260922233000_early_match_reports/migration.sql','utf8');
  const ownGoalMigration=fs.readFileSync('prisma/migrations/20260922234500_own_goal_match_reports/migration.sql','utf8');
  assert.match(migration,/BEFORE INSERT ON "MatchResult"/); assert.match(migration,/FOR UPDATE/); assert.match(migration,/AFTER INSERT ON "MatchResult"/);
  assert.match(ownGoalMigration,/"ownGoals"/); assert.match(ownGoalMigration,/goal_total \+ report\."ownGoals" = expected/);
});
test('pending report UI reopens saved scorers, appearances and ratings without an official result', async()=>{
  const Fields=load('src/components/captain/MatchDetailsPlayerFields.tsx').default;
  const component=load('src/components/captain/EarlyMatchReports.tsx',{
    'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){}},
    '@/lib/prisma':{prisma:{fixture:{findMany:async()=>[{id:'f',kickoffAt:new Date(),homeTeam:{name:'A'},awayTeam:{name:'B'},selections:[],earlyReports:[{contributions:[{teamMemberId:'m0',name:'Player 0',goals:7,assists:0}],performances:[{teamMemberId:'m0',rating:9.2}],ownGoals:1,playerOfMatchName:'Player 0'}]}]},teamMember:{findMany:async()=>members.map(m=>({...m,role:'PLAYER'}))}}},
    '@/lib/requireCaptain':{requireCaptain:async()=>({})},'@/lib/match-reports/early':{saveEarlyMatchReport(){},getEarlyMatchReportCutoff},
    '@/lib/datetime/london':{formatDateTimeInLondon:()=> 'Test date'},'./MatchDetailsPlayerFields':Fields,
    '@/components/ui/FormListboxField':props=>React.createElement('input',{name:props.name,value:props.value,readOnly:true}),
  }).default;
  const html=renderToStaticMarkup(await component({teamId:'a'}));
  assert.match(html,/Awaiting official result/); assert.match(html,/Report saved/); assert.match(html,/1 own goal/); assert.match(html,/name="ownGoals" value="1"/); assert.match(html,/value="7"/); assert.match(html,/value="9.2"/);
  assert.match(html,/name="fixtureId" value="f"/); assert.doesNotMatch(html,/name="resultId"/);
  assert.equal(await component({teamId:'a',outcome:'W'}),null);
});
