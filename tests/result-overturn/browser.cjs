const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');const {build}=require('esbuild');
const {chromium}=require(process.env.OVERTURN_PLAYWRIGHT||'playwright');
(async()=>{
 const dir='artifacts/result-overturn';fs.mkdirSync(dir,{recursive:true});
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import Form from './src/components/admin/OverturnResultForm';import Notice from './src/components/fixtures/OverturnedResultNotice';window.__submitted=[];createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-3xl space-y-6 p-5 text-white"><h1 className="text-2xl font-semibold">Result and competition decision</h1><Form fixtureId="fixture" requestId="test" updatedAt="test" homeScore={4} awayScore={1} homeTeam={{id:'will',name:'Will test team'}} awayTeam={{id:'nomads',name:'Nomads test team'}} action={async data=>{window.__submitted.push(Object.fromEntries(data))}}/><Notice homeName="Will test team" awayName="Nomads test team" overturn={{originalHomeScore:4,originalAwayScore:1,reasonCode:'PLAYER_LIMIT'}}/></main>);`;
 const built=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const css=[];const walk=d=>{for(const name of fs.readdirSync(d)){const f=path.join(d,name);if(fs.statSync(f).isDirectory())walk(f);else if(f.endsWith('.css'))css.push(fs.readFileSync(f,'utf8'))}};walk('.next/static');assert.ok(css.length,'production CSS must exist');
 const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#080d14;margin:0}${css.join('\n')}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?built.outputFiles[0].text:html)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 let browser;try{browser=await chromium.launch({headless:true});for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await page.goto(`http://127.0.0.1:${port}`);await page.getByText('Overturn result — competition decision',{exact:true}).click();
   await page.getByRole('button',{name:'Record overturned result',exact:true}).click();assert.equal(await page.evaluate(()=>window.__submitted.length),0);
   await page.getByRole('radio',{name:'Nomads test team',exact:true}).check();
   await page.getByRole('radio',{name:'Player-limit breach',exact:true}).check();
   await page.getByLabel('Applicable rules and decision basis').fill('League Rules v2.3 sections 4, 8 and 14');
   await page.getByLabel('Evidence and review notes — admin only').fill('Test only: ten players took part; approval checked; response opportunity recorded.');
   await page.locator('input[name="confirmed"]').check();
   assert.match(await page.getByRole('status').innerText(),/Will test team 0–3 Nomads test team/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
   await page.screenshot({path:`${dir}/confirmation-${width}.png`,fullPage:true});
   await page.getByRole('button',{name:'Record overturned result',exact:true}).click();await page.waitForFunction(()=>window.__submitted.length===1);
   const submitted=await page.evaluate(()=>window.__submitted[0]);assert.equal(submitted.winnerTeamId,'nomads');assert.equal(submitted.expectedHomeScore,'4');assert.equal(submitted.expectedAwayScore,'1');assert.equal(submitted.confirmed,'yes');
   assert.deepEqual(errors,[]);await page.close();console.log(`PASS browser ${width}: explicit confirmation, 0–3 award, 4–1 original, no overflow`);
 }}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
