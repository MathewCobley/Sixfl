const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {build} = require('esbuild');
const {chromium} = require(process.env.GOAL_MONTH_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname,'..');
let browser,bundle;
const goal={id:'goal-one',fixtureId:'fixture-one',teamId:'team-one',monthKey:'2026-09',goalNumber:1,scorerName:'Test Scorer',teamName:'Example FC',opponentName:'Opponent FC',teamLogoUrl:null,leagueName:'Example League',kickoffAt:'2026-09-03T19:00:00Z',nominationCount:1,voteCount:0,videoUrls:['https://youtu.be/dQw4w9WgXcQ']};
function payload({nominees=true,eligible=true,voting=false}={}) {
  return {viewer:{signedIn:eligible,eligible},nominations:[{key:'2026-09',label:'September 2026',closesAt:'2026-10-05T23:00:00Z',usedNominations:0,maxNominations:3,nominatedCandidateIds:[],candidates:nominees?[goal]:[],fixtures:[{id:'fixture-one',kickoffAt:goal.kickoffAt,homeTeamId:'team-one',awayTeamId:'team-two',homeTeamName:'Example FC',awayTeamName:'Opponent FC',homeScore:6,awayScore:4,sixflTvUrl:goal.videoUrls[0],videoUrls:goal.videoUrls,leagueName:'Example League'}]}],voting:{key:'2026-09',label:'September 2026',open:voting,closesAt:'2026-10-12T23:00:00Z',candidates:voting?[goal]:[],selectedCandidateId:null},winners:[],legacy:{nominationsOpen:false,votingMayBeOpen:false,nominationsCloseAt:'2026-09-13T23:00:00Z',votingClosesAt:'2026-09-15T17:00:00Z'}};
}
test.before(async()=>{
  const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Panel from './src/components/goal-of-month/MonthlyGoalsPanel';import Promo from './src/components/goal-of-week/GoalOfWeekDashboardPromo';const root=createRoot(document.getElementById('root'));let version=0;window.mount=kind=>root.render(kind==='promo'?<Promo key={++version} teamId="team-one" href="/goal-of-the-week?from=captain&teamId=team-one"/>:<Panel key={++version}/>);`,loader:'tsx',resolveDir:root},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-next-link',setup(api){api.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));api.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:"import React from 'react';export default function Link(props){return React.createElement('a',props)}",resolveDir:root}));api.onResolve({filter:/^@\//},args=>{const base=path.join(root,'src',args.path.slice(2));return{path:[base+'.ts',base+'.tsx',base].find(file=>fs.existsSync(file)&&fs.statSync(file).isFile())};});}}]});
  bundle=result.outputFiles[0].text;browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();});
async function screen(width,data,kind='panel') {
  const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();
  await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:''}));
  await page.setContent('<!doctype html><style>*{box-sizing:border-box}body{margin:0;background:#06120e;color:#fff;font:16px Arial;padding:16px}#root{max-width:1200px;margin:auto}section,article,div{min-width:0}section,article{padding:12px;border:1px solid #234;margin:12px 0}button,select,input{font:inherit;max-width:100%;padding:10px}select,input{display:block;width:100%}button:disabled{opacity:.5}img,iframe{width:100%;max-width:100%;border:0}a{color:#9ef}label{display:block;margin:10px 0}.grid{display:grid;gap:16px}[class*="aspect-video"]{aspect-ratio:16/9;overflow:hidden}button img{height:auto}[class*="aspect-video"]>button,[class*="aspect-video"]>iframe{height:100%;width:100%}@media(min-width:640px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1280px){article~article{margin-top:12px}}</style><div id="root"></div>');
  await page.evaluate(({data,goal})=>{
    window.goalData=data;window.testGoal=goal;window.posts=[];window.mode='success';
    const respond=(ok,result)=>({ok,json:async()=>result});
    window.finishSave=body=>{
      if(body.action==='vote')window.goalData.voting.selectedCandidateId=body.candidateId;
      else{const period=window.goalData.nominations[0];period.candidates=[{...window.testGoal,goalNumber:Number(body.goalNumber)}];period.nominatedCandidateIds=['goal-one'];period.usedNominations=1;}
      return respond(true,{ok:true,candidateId:'goal-one'});
    };
    window.fetch=async(url,options={})=>{
      if(options.method!=='POST')return respond(true,structuredClone(window.goalData));
      const body=JSON.parse(options.body);window.posts.push(body);
      if(window.mode==='defer')return new Promise(resolve=>window.release=()=>resolve(window.finishSave(body)));
      if(window.mode==='fail')return respond(false,{error:'Could not save the nomination. Please try again.'});
      return window.finishSave(body);
    };
  },{data,goal});
  await page.addScriptTag({content:bundle});await page.evaluate(kind=>window.mount(kind),kind);
  await page.getByRole('heading',{name:kind==='promo'?/Goal of the Month — current nominees/:/current nominees/}).waitFor();
  return{context,page};
}
for(const width of [390,1440]) {
  test(`monthly nomination save and shared dashboard footage at ${width}px`,async()=>{
    const {context,page}=await screen(width,payload({nominees:false}));
    try{
      await page.getByLabel('Recorded fixture').selectOption('fixture-one');
      await page.getByLabel('Goal number in the match').fill('1');
      await page.getByLabel('Scoring team').selectOption('team-one');
      await page.getByLabel('Scorer’s name (optional)').fill('Test Scorer');
      await page.evaluate(()=>window.mode='defer');
      await page.getByRole('button',{name:'Submit nomination',exact:true}).click();
      await page.waitForFunction(()=>window.posts.length===1);
      assert.equal(await page.getByRole('button',{name:'Saving…',exact:true}).isDisabled(),true);
      await page.evaluate(()=>window.release());
      await page.getByRole('button',{name:'You nominated this goal'}).waitFor();
      assert.equal(await page.locator('[data-monthly-goal="goal-one"]').count(),1);
      assert.equal(await page.locator('iframe').count(),0);
      await page.getByRole('button',{name:/Play footage for Example FC/}).click();
      const frame=page.locator('iframe');await frame.waitFor();assert.match(await frame.getAttribute('src'),/youtube-nocookie.com\/embed\/dQw4w9WgXcQ/);assert.equal((await frame.getAttribute('src')).includes('autoplay=1'),false);
      await page.evaluate(()=>window.mount('promo'));
      await page.getByRole('heading',{name:/Goal of the Month — current nominees/}).waitFor();
      await page.locator('[data-monthly-goal="goal-one"]').waitFor();
      assert.equal(await page.getByRole('link',{name:/Nominate \/ view all goals/}).getAttribute('href'),'/goal-of-the-month?from=captain&teamId=team-one');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }finally{await context.close();}
  });
  test(`failed save keeps fixture selection and permits a deliberate retry at ${width}px`,async()=>{
    const {context,page}=await screen(width,payload({nominees:false}));
    try{
      await page.getByLabel('Recorded fixture').selectOption('fixture-one');await page.getByLabel('Goal number in the match').fill('1');await page.getByLabel('Scoring team').selectOption('team-one');
      await page.evaluate(()=>window.mode='fail');await page.getByRole('button',{name:'Submit nomination',exact:true}).click();await page.getByRole('alert').filter({hasText:'Could not save'}).waitFor();
      assert.equal(await page.getByLabel('Recorded fixture').inputValue(),'fixture-one');assert.equal(await page.getByLabel('Goal number in the match').inputValue(),'1');assert.equal(await page.getByRole('button',{name:'Submit nomination',exact:true}).isEnabled(),true);
      assert.equal(await page.evaluate(()=>window.posts.length),1);await page.evaluate(()=>window.mode='success');await page.getByRole('button',{name:'Submit nomination',exact:true}).click();await page.getByRole('button',{name:'You nominated this goal'}).waitFor();assert.equal(await page.evaluate(()=>window.posts.length),2);
    }finally{await context.close();}
  });
}
test('anonymous visitors can watch but cannot nominate or vote',async()=>{
  const {context,page}=await screen(390,payload({eligible:false,voting:true}));
  try{assert.equal(await page.getByRole('button',{name:'Nominate this goal',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Vote for this goal',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('link',{name:'Sign in to take part'}).count(),1);assert.equal(await page.evaluate(()=>window.posts.length),0);}finally{await context.close();}
});
test('verified player vote shows saved choice and no duplicate submission',async()=>{
  const {context,page}=await screen(1440,payload({voting:true}));
  try{await page.getByRole('button',{name:'Vote for this goal',exact:true}).click();await page.getByRole('button',{name:'Your vote is saved',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Your vote is saved',exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>window.posts.length),1);}finally{await context.close();}
});
