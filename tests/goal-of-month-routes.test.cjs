const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const root = path.resolve(__dirname,'..');
function load(file,mocks) {
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
