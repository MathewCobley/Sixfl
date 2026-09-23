const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const root = path.resolve(__dirname,'..');
function load(file,mocks) {
  // Match the ES-module default export shape used by real Next/React imports.
  for(const mock of Object.values(mocks)) if(mock && typeof mock==='object' && Object.hasOwn(mock,'default')) Object.defineProperty(mock,'__esModule',{value:true});
  const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',code)(id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),module,module.exports);
  return module.exports;
}
const json=(body,init={})=>new Response(JSON.stringify(body),{...init,headers:{'Content-Type':'application/json',...init.headers}});
const next={'next/server':{NextResponse:{json}}};
function monthly({signedIn=true,verified=true,member=true,admin=false,captain=0}={}) {
  const writes=[];
  class GoalAwardError extends Error{constructor(message,status=409){super(message);this.status=status;}}
  const route=load('src/app/api/goal-of-month/community/route.ts',{
    ...next,'next-auth':{getServerSession:async()=>signedIn?{user:{email:'example@example.invalid'}}:null},'@/auth':{authOptions:{}},
    '@/lib/prisma':{prisma:{user:{findUnique:async()=>({id:'actual-user',role:admin?'ADMIN':'PLAYER',emailVerified:verified?new Date():null,_count:{teamMembers:member?1:0}})},team:{count:async()=>captain}}},
    '@/lib/goal-of-month/community':{GoalAwardError,getMonthlyPageData:async id=>({nominations:[],viewerId:id}),nominateMonthlyGoal:async input=>{writes.push(input);return{candidateId:'goal'};},voteMonthlyGoal:async(...args)=>{writes.push(args);return{candidateId:args[1]};}},
  });return{route,writes};
}
const body={action:'nominate',fixtureId:'fixture-one',scoringTeamId:'team-one',goalNumber:1,userId:'another-person'};
const request=(data=body,origin='https://sixfl.co.uk')=>new Request('https://sixfl.co.uk/api/goal-of-month/community',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(data)});
test('anonymous viewing works, while anonymous and unverified requests cannot nominate',async()=>{
  for(const options of [{signedIn:false},{verified:false},{member:false}]){
    const h=monthly(options);const view=await h.route.GET();assert.equal(view.status,200);assert.equal((await view.json()).viewer.eligible,false);
    assert.equal((await h.route.POST(request())).status,403);assert.equal(h.writes.length,0);
  }
});
test('verified players and captains act only as the real signed-in user',async()=>{
  for(const options of [{},{member:false,captain:1},{verified:false,member:false,admin:true}]){
    const h=monthly(options);assert.equal((await h.route.POST(request())).status,200);
    assert.equal(h.writes[0].userId,'actual-user');assert.equal(h.writes.length,1);
  }
});
test('cross-site and malformed submissions are rejected before writes',async()=>{
  const h=monthly();assert.equal((await h.route.POST(request(body,'https://other.invalid'))).status,403);
  for(const data of [null,[],{...body,fixtureId:'../wrong'},{...body,goalNumber:0},{action:'vote',candidateId:'../invalid'}])assert.equal((await h.route.POST(request(data))).status,400);
  assert.equal(h.writes.length,0);
});
function weekly({closed=false}={}){
  let writes=0;
  const date=new Date(Date.now()+(closed?-86400000:86400000));
  const route=load('src/app/api/goal-of-week/community/route.ts',{
    ...next,'@/lib/goal-of-month/community':{getAwardTransition:async()=>({weeklyNominationsCloseAt:date,weeklyVotingClosesAt:date})},
    '@/lib/goal-of-week/legacy-api':{GET:async()=>json({nomination:{fixtures:[{id:'weekly'}],nominatedCandidateIds:['saved-nom']},voting:{open:true,windowOpen:true,selectedCandidateId:'saved-vote'},latestWinner:{id:'old-winner'}}),POST:async req=>{writes++;return json({ok:true,action:(await req.json()).action});}},
  });return{route,writes:()=>writes};
}
test('weekly transition preserves pending participation but does not open new weekly rounds',async()=>{
  const open=weekly();assert.equal((await open.route.POST(request({action:'vote'}))).status,200);assert.equal(open.writes(),1);
  const closed=weekly({closed:true});for(const action of ['vote','nominate'])assert.equal((await closed.route.POST(request({action}))).status,409);
  assert.equal(closed.writes(),0);
  const view=await(await closed.route.GET()).json();assert.deepEqual(view.nomination.fixtures,[]);assert.deepEqual(view.nomination.nominatedCandidateIds,['saved-nom']);assert.equal(view.voting.open,false);assert.equal(view.voting.selectedCandidateId,'saved-vote');assert.equal(view.latestWinner.id,'old-winner');
});
test('old public links redirect to monthly and keep team/preview return context',async()=>{
  const route=load('src/app/(public)/goal-of-the-week/page.tsx',{'next/link':{default:()=>null},'next/navigation':{redirect:href=>{throw new Error(href);}},'@/components/goal-of-week/LegacyWeeklyPage':{default:()=>null}}).default;
  await assert.rejects(route({searchParams:Promise.resolve({from:'player',teamId:'team-one',previewMembershipId:'membership-one'})}),/goal-of-the-month\?from=player&teamId=team-one&previewMembershipId=membership-one/);
  assert.ok(await route({searchParams:Promise.resolve({legacy:'1'})}));
});
test('monthly return link preserves authorised preview context without changing vote identity',async()=>{
  const route=load('src/app/(public)/goal-of-the-month/page.tsx',{'next/link':{default:props=>React.createElement('a',props)},'@/components/goal-of-month/MonthlyGoalsPanel':{default:()=>null}}).default;
  const html=renderToStaticMarkup(await route({searchParams:Promise.resolve({from:'player',teamId:'team-one',previewMembershipId:'membership-one'})}));
  assert.ok(html.includes('/player/team/team-one?previewMembershipId=membership-one'));
  const unsafe=renderToStaticMarkup(await route({searchParams:Promise.resolve({from:'player',teamId:'../unsafe'})}));assert.equal(unsafe.includes('Back to player dashboard'),false);
});
test('monthly homepage prioritises its winner but does not relabel previous weekly awards',async()=>{
  for(const winner of [null,{id:'monthly-winner'}]){
    const route=load('src/components/home/MonthlyGoalHomepageFeature.tsx',{'next/link':{default:props=>React.createElement('a',props)},'@/components/goal-of-month/GoalNomineeCard':{default:()=>React.createElement('p',null,'Monthly clip')},'@/components/home/GoalOfWeekHomepageFeature':{default:()=>React.createElement('p',null,'Goal of the Week archive')},'@/lib/goal-of-month/community':{getMonthlyWinners:async()=>winner?[winner]:[],monthlyCandidatePayload:goal=>goal}}).default;
    const html=renderToStaticMarkup(await route({channelUrl:'https://youtube.com/@sixfl'}));
    assert.ok(html.includes(winner?'Monthly clip':'Goal of the Week archive'));assert.ok(html.includes('/goal-of-the-month'));
  }
});

const promoPath='src/components/goal-of-week/GoalOfWeekDashboardPromo.tsx';
const candidate=(id,monthKey)=>({id,monthKey});
const period=(key,label,candidates=[])=>({key,label,candidates});
const competition=(nominations,voting={key:'2026-08',label:'August 2026',open:false,candidates:[]},winners=[])=>({nominations,voting,winners});
function renderPromo(data,{from='captain',loading=false,error=''}={}) {
  const component=load(promoPath,{
    'next/link':{default:props=>React.createElement('a',props)},
    '@/components/goal-of-month/GoalNomineeCard':{default:({goal,winner})=>React.createElement('article',{'data-goal':goal.id,'data-winner':winner?'true':undefined},goal.monthKey)},
    '@/components/goal-of-month/useMonthlyGoals':{useMonthlyGoals:()=>({data,loading,error,refresh(){throw Error('External requests forbidden');}})},
  }).default;
  return renderToStaticMarkup(React.createElement(component,{teamId:'team-one',href:`/goal-of-the-week?from=${from}&teamId=team-one&previewMembershipId=membership-one`}));
}
const plain=html=>html.replace(/<[^>]+>/g,'');
for(const from of ['captain','player']) {
  test(`${from} dashboard names September and preserves the preview return link`,()=>{
    const html=renderPromo(competition([period('2026-09','September 2026',[candidate('sep','2026-09')])]),{from});
    assert.match(html,/<h2[^>]*>September Goal of the Month<\/h2>/);
    assert.match(html,/Current nominees/);
    assert.match(plain(html),/See a great goal from September\? Nominate a new one or back an existing nominee\./);
    assert.match(plain(html),/Nominate \/ back goals/);
    assert.ok(html.includes(`/goal-of-the-month?from=${from}&amp;teamId=team-one&amp;previewMembershipId=membership-one`));
    assert.equal((html.match(/data-goal="sep"/g)||[]).length,1);
  });
}
for(const [key,label,nextKey,nextLabel] of [['2026-09','September 2026','2026-10','October 2026'],['2026-12','December 2026','2027-01','January 2027']]) {
  test(`${label} voting stays on the award month despite the newer nomination round`,()=>{
    const html=renderPromo(competition([period(nextKey,nextLabel,[candidate('new',nextKey)])],{...period(key,label,[candidate('finalist',key)]),open:true}));
    assert.ok(plain(html).includes(`${label.replace(/ \d{4}$/,'')} Goal of the Month`));
    assert.match(html,/Voting is open — choose your winner/);assert.match(html,/Vote now/);
    assert.match(html,/data-goal="finalist"/);assert.doesNotMatch(html,/data-goal="new"|Current nominees/);
  });
}
test('overlap names both nomination months without mixing their nominee cards',()=>{
  const html=renderPromo(competition([period('2026-09','September 2026',[candidate('sep','2026-09')]),period('2026-10','October 2026',[candidate('oct','2026-10')])]));
  const sep=html.indexOf('data-monthly-period="2026-09"'),oct=html.indexOf('data-monthly-period="2026-10"');
  assert.ok(sep>=0&&oct>sep);
  assert.match(html.slice(sep,oct),/September Goal of the Month/);assert.match(html.slice(sep,oct),/data-goal="sep"/);assert.doesNotMatch(html.slice(sep,oct),/data-goal="oct"/);
  assert.match(html.slice(oct),/October Goal of the Month/);assert.match(html.slice(oct),/data-goal="oct"/);
});
test('three-clip budget, empty periods, winner, loading and error feedback are preserved',()=>{
  const html=renderPromo(competition([period('2026-09','September 2026',[1,2,3].map(i=>candidate(`sep-${i}`,'2026-09'))),period('2026-10','October 2026',[candidate('oct','2026-10')])]));
  assert.equal((html.match(/data-goal=/g)||[]).length,3);
  assert.match(html,/More nominees are available on the competition page/);assert.doesNotMatch(html,/No October nominees yet/);
  const empty=renderPromo(competition([period('2026-09','September 2026')],undefined,[candidate('winner','2026-08')]));
  assert.match(empty,/September Goal of the Month/);assert.match(empty,/No September nominees yet/);assert.match(empty,/Latest monthly winner/);assert.match(empty,/data-goal="winner" data-winner="true"/);
  const loading=renderPromo(null,{loading:true});assert.match(loading,/Loading nominated goals/);assert.doesNotMatch(loading,/September|October|data-monthly-period/);
  assert.match(renderPromo(null,{error:'Competition unavailable'}),/Competition unavailable.*Try again/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,promoPath),'utf8'),/Date\.now\(|new Date\(/);
});
test('shared dashboard owner inventory contains no old generic nomination title',()=>{
  const found=[];
  function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.(?:tsx?|[cm]?js)$/.test(file))fs.readFileSync(path.join(root,file),'utf8').split('\n').forEach((line,i)=>{if(/GoalOfWeekDashboardPromo|Goal of the Month — current nominees/.test(line))found.push(`${file}:${i+1}:${line.trim()}`);});}}
  walk('src');walk('scripts');
  assert.ok(found.some(line=>line.includes('src/components/captain/CaptainSupportPanel.tsx')&&line.includes('GoalOfWeekDashboardPromo')));
  assert.ok(found.some(line=>line.includes('src/app/player/team/[teamid]/layout.tsx')&&line.includes('GoalOfWeekDashboardPromo')));
  assert.ok(!found.some(line=>line.includes('Goal of the Month — current nominees')));
  console.log('Monthly dashboard source owners:\n'+found.join('\n'));
});

test('player monthly route requires team access and uses app navigation without a back link', async () => {
  async function render({signedIn=true,role='PLAYER',member=true,team=true,preview=true}={}) {
    const route=load('src/app/player/team/[teamid]/goal-of-the-month/page.tsx', {
      'next/link':{default:props=>React.createElement('a',props)},
      'next-auth':{getServerSession:async()=>signedIn?{user:{email:'player@example.invalid'}}:null},
      'next/navigation':{redirect:href=>{throw new Error(href);},notFound:()=>{throw new Error('not-found');}},
      '@prisma/client':{UserRole:{ADMIN:'ADMIN'}},'@/auth':{authOptions:{}},
      '@/lib/prisma':{prisma:{user:{findUnique:async()=>({role,teamMembers:member?[{id:'member'}]:[]})},team:{findUnique:async()=>team?{id:'team-one'}:null},teamMember:{findFirst:async()=>preview?{id:'membership-one'}:null}}},
      '@/components/goal-of-month/MonthlyGoalsPanel':{default:props=>{assert.deepEqual(props,{playerApp:true});return React.createElement('p',null,'Shared monthly competition');}},
    }).default;
    return renderToStaticMarkup(await route({params:Promise.resolve({teamid:'team-one'}),searchParams:Promise.resolve({previewMembershipId:'membership-one'})}));
  }
  await assert.rejects(render({signedIn:false}),/callbackUrl=%2Fplayer%2Fteam%2Fteam-one%2Fgoal-of-the-month/);
  await assert.rejects(render({member:false}),/not-found/);
  await assert.rejects(render({team:false}),/not-found/);
  const player=await render();assert.match(player,/Shared monthly competition/);assert.doesNotMatch(player,/<a\b/);assert.doesNotMatch(player,/previewMembershipId/);
  const admin=await render({role:'ADMIN',member:false});assert.doesNotMatch(admin,/<a\b/);
  assert.doesNotMatch(await render({role:'ADMIN',preview:false}),/previewMembershipId/);
});

test('shared monthly panel keeps public website links out of the player app', () => {
  const data={viewer:{eligible:false},nominations:[],voting:{open:false},legacy:{votingMayBeOpen:true},winners:[]};
  const Panel=load('src/components/goal-of-month/MonthlyGoalsPanel.tsx',{
    'next/link':{default:props=>React.createElement('a',props)},
    './GoalNomineeCard':{default:()=>null},'@/components/ui/FormListboxField':{default:()=>null},
    './useMonthlyGoals':{useMonthlyGoals:()=>({data,loading:false,error:null,refresh:async()=>{}})},
  }).default;
  const app=renderToStaticMarkup(React.createElement(Panel,{playerApp:true}));
  assert.doesNotMatch(app,/href="\/(?:login|goal-of-the-week)/);
  const publicPage=renderToStaticMarkup(React.createElement(Panel));
  assert.match(publicPage,/href="\/goal-of-the-week\?legacy=1"/);assert.match(publicPage,/href="\/login/);
});
