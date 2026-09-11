const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build}=require('esbuild'),{chromium}=require(process.env.OVERTURN_PLAYWRIGHT_MODULE||'playwright');let browser,bundle,css;
before(async()=>{
 browser=await chromium.launch({headless:true});
 bundle=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Form from './src/components/results/OverturnResultForm';import Notice from './src/components/results/ResultOverturnNotice';const root=createRoot(document.getElementById('root'));window.notice=()=>root.render(<Notice result={{homeScore:0,awayScore:3,originalHomeScore:4,originalAwayScore:1,overturnedAt:'2026-09-12'}} homeName='Example team A' awayName='Example team B'/>);root.render(<Form fixtureId='fixture-one' home={{id:'a',name:'Example team A'}} away={{id:'b',name:'Example team B'}} original={{homeScore:4,awayScore:1}}/>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}`,loader:'js',resolveDir:process.cwd()}))}}]})).outputFiles[0].text;
 function files(d){return fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name)]):[];}
 css=files('.next/static').filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(p,'utf8')).join('\n');assert.ok(css.length);fs.mkdirSync('/tmp/overturn-evidence',{recursive:true});
});after(()=>browser?.close());
for(const width of [1440,390])test(`real overturn form previews before confirming and explains dual scores (${width}px)`,async()=>{
 const context=await browser.newContext({viewport:{width,height:1050}}),page=await context.newPage();const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async r=>{if(r.request().method()==='POST'){const body=r.request().postDataJSON();requests.push(body);return r.fulfill({contentType:'application/json',body:JSON.stringify(body.action==='preview'?{preview:{token:'bound-token',original:{homeScore:4,awayScore:1},awarded:{homeScore:0,awayScore:3},expiresAt:Date.now()+600000}}:{saved:true})});}
 return r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#071710;color:white"><main id="root" style="max-width:750px;padding:20px;margin:auto"></main></body></html>'});});
 try{
  await page.goto('https://sixfl.example/');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});await page.getByRole('button',{name:'Preview overturned result'}).waitFor();assert.equal(requests.length,0);
  await page.getByRole('radio',{name:'Example team B',exact:true}).check();await page.getByRole('radio',{name:'Player-limit breach',exact:true}).check();
  await page.getByLabel('Decision reason — admin only').fill('Evidence reviewed: ten different players participated without approval.');await page.getByLabel('Evidence reference — admin only').fill('TEST EVIDENCE reference');await page.getByLabel('Rules in force for this fixture — admin only').fill('Applicable test rules, sections 4, 8 and 14');
  await page.getByRole('button',{name:'Preview overturned result'}).click();await page.getByRole('heading',{name:'Check the decision before saving'}).waitFor();
  assert.equal(requests.length,1);assert.equal(requests[0].action,'preview');assert.equal(requests[0].winnerTeamId,'b');
  assert.ok((await page.locator('body').innerText()).includes('Example team A 4–1 Example team B'));assert.ok((await page.locator('body').innerText()).includes('Example team A 0–3 Example team B'));
  const confirm=page.getByRole('button',{name:'Confirm overturn — no messages'});assert.equal(await confirm.isDisabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`/tmp/overturn-evidence/preview-${width}.png`,fullPage:true});await page.getByRole('checkbox').check();await confirm.click();await page.getByRole('heading',{name:'Overturned result recorded'}).waitFor();
  assert.deepEqual(requests[1],{action:'confirm',token:'bound-token',confirmed:true});assert.equal(await page.getByRole('link',{name:'View saved decision'}).getAttribute('href'),'/admin/fixtures/fixture-one/overturn');
  await page.evaluate(()=>window.notice());await page.getByText('Awarded · Result overturned by SIXFL',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(!(await page.locator('body').innerText()).includes('TEST EVIDENCE'));
  await page.screenshot({path:`/tmp/overturn-evidence/notice-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
