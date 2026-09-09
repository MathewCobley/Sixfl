const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build}=require('esbuild'),{chromium}=require(process.env.CORRECTION_PLAYWRIGHT_MODULE||'playwright');let browser,bundle,css;
before(async()=>{
 browser=await chromium.launch({headless:true});bundle=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Form from './src/components/payments/CorrectOriginalPlayerChargeForm';createRoot(document.getElementById('root')).render(<Form feeId="fee-one" teamId="team-one" assignedPence={1200} receivedPence={800}/>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'link-only',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}`,loader:'js',resolveDir:process.cwd()}))}}]})).outputFiles[0].text;
 function files(d){return fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name)]):[];}
 css=files('.next/static').filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(p,'utf8')).join('\n');fs.mkdirSync('/tmp/ledger-correction-ui',{recursive:true});
});after(()=>browser?.close());
for(const width of [1440,390])test(`admin form requires a preview and explicit confirm; receipt is never re-entered (${width}px)`,async()=>{
 const context=await browser.newContext({viewport:{width,height:1050}}),page=await context.newPage();const requests=[];
 await context.route('**/*',async r=>{if(r.request().method()==='POST'){const body=r.request().postDataJSON();requests.push(body);return r.fulfill({contentType:'application/json',body:JSON.stringify(body.action==='preview'?{preview:{token:'bound-token',originalPence:1200,receivedPence:800,outstandingPence:400,reason:'No waiver agreed; restore remaining debt.',expiresAt:Date.now()+600000}}:{saved:true})});}
 return r.fulfill({contentType:'text/html',body:'<html><body style="background:#071710;color:white"><main id="root" style="max-width:750px;padding:20px;margin:auto"></main></body></html>'});});
 try{await page.goto('https://sixfl.example/');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});await page.getByRole('button',{name:'Preview correction'}).waitFor();
  assert.equal(requests.length,0);await page.getByLabel('Reason for correction').fill('No waiver agreed; restore remaining debt.');await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Preview correction'}).click();await page.getByRole('heading',{name:'Review before saving'}).waitFor();assert.equal(requests.length,1);assert.equal(requests[0].action,'preview');
  assert.ok((await page.locator('body').innerText()).includes('£4.00'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`/tmp/ledger-correction-ui/preview-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Confirm correction — no message'}).click();await page.getByRole('heading',{name:'Correction saved'}).waitFor();
  assert.equal(requests.length,2);assert.deepEqual(requests[1],{action:'confirm',token:'bound-token',confirmed:true});assert.equal(await page.getByRole('link',{name:'Open player account'}).getAttribute('href'),'/captain/team/team-one/player-payments/account/fee-one');
 }finally{await context.close();}
});
