const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');const {build}=require('esbuild');
const {chromium}=require(process.env.OVERTURN_PLAYWRIGHT||'playwright');
(async()=>{
 const dir='artifacts/result-overturn';fs.mkdirSync(dir,{recursive:true});
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import View from './src/components/admin/OverturnEmailPanelView';import Notice from './src/components/fixtures/OverturnedResultNotice';import {buildResultOverturnEmail} from './src/lib/fixtures/result-overturn-email-content';const facts={homeTeamName:'Northallerton Nomads',awayTeamName:'Under Sixes',originalHomeScore:1,originalAwayScore:4,awardedHomeScore:3,awardedAwayScore:0,reasonCode:'PLAYER_LIMIT',kickoffAt:new Date('2026-09-09T20:15:00Z')};window.__submitted=[];createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-3xl space-y-6 p-5 text-white"><Notice homeName={facts.homeTeamName} awayName={facts.awayTeamName} overturn={facts}/><View fixtureId="fixture" decisionId="decision" panel={{...buildResultOverturnEmail(facts),records:[{id:'queued',email:'captain@example.invalid',teamName:'Northallerton Nomads',status:'QUEUED',sentAt:null}],teamNames:[facts.homeTeamName,facts.awayTeamName]}} action={async data=>{window.__submitted.push(Object.fromEntries(data));await new Promise(r=>setTimeout(r,400));}}/></main>);`;
 const built=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'browser-only-framework-boundaries',setup(b){const stubs={'next/link':`import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}`,'@prisma/client':`export const NotificationChannel={EMAIL:'EMAIL',SMS:'SMS'};export const NotificationDispatchStatus={};`};b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],resolveDir:process.cwd(),loader:'js'}));}}]});
 const css=[];const walk=d=>{for(const name of fs.readdirSync(d)){const f=path.join(d,name);if(fs.statSync(f).isDirectory())walk(f);else if(f.endsWith('.css'))css.push(fs.readFileSync(f,'utf8'))}};walk('.next/static');assert.ok(css.length);
 const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#080d14;margin:0}${css.join('\n')}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?built.outputFiles[0].text:html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{browser=await chromium.launch({headless:true});for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Email both teams',exact:true}).click();assert.equal(await page.evaluate(()=>window.__submitted.length),0);
  await page.locator('input[name="confirmed"]').check();
  assert.match(await page.locator('body').innerText(),/Original on-pitch result: Northallerton Nomads 1–4 Under Sixes/);
  assert.match(await page.locator('body').innerText(),/Official awarded result: Northallerton Nomads 3–0 Under Sixes/);
  assert.match(await page.locator('body').innerText(),/Default win awarded to Northallerton Nomads/);
  assert.match(await page.locator('body').innerText(),/Queued/);
  assert.equal(await page.locator('input[name="body"],textarea').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`${dir}/email-notice-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Email both teams',exact:true}).click();await page.waitForFunction(()=>window.__submitted.length===1);
  assert.deepEqual(await page.evaluate(()=>window.__submitted[0]),{fixtureId:'fixture',decisionId:'decision',confirmed:'yes'});
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS email browser ${width}: original/award/default winner and confirmed fixed-copy request`);
 }}finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
