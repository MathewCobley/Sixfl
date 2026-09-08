const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require(process.env.WARNING_PLAYWRIGHT_MODULE || 'playwright');
let browser, bundle, css='';
before(async () => {
  browser=await chromium.launch({headless:true});
  const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Form from './src/components/admin/payments/PlayerPaymentWarningForm'; createRoot(document.getElementById('root')).render(<Form feeId="fee-one" email="player@example.invalid" phone="+447700900123" emailAllowed smsAllowed defaultDeadline="2026-09-10T18:00" />);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'isolated-ui-actions',setup(b){
    b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'test'}));
    b.onResolve({filter:/player-warning\/actions$/},()=>({path:'actions',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},args=>({loader:'js',contents:args.path==='link'?`import React from 'react'; export default function Link(props){return React.createElement('a',props,props.children)}`:`
      export async function previewPlayerWarningAction(input){window.previews=(window.previews||[]).concat([input]);return {ok:true,preview:{previewToken:'signed-one',channel:input.channel,playerName:'Test Player',recipient:input.channel==='EMAIL'?'player@example.invalid':'+447700900123',amount:'£5.00',fixtureLabel:'Test Squad vs Other Squad',deadline:'10 September 2026, 18:00 BST',scheduledFor:'8 September 2026, 13:00 BST',paymentUrl:'https://sixfl.co.uk/pay/player-match-fee/one',subject:input.channel==='EMAIL'?'Payment warning':null,bodyText:'Please pay £5.00 by 10 September: https://sixfl.co.uk/pay/player-match-fee/one',bodyHtml:input.channel==='EMAIL'?'<html><body><p>Individual payment warning for Test Player.</p></body></html>':null}}}
      export async function sendPlayerWarningAction(token){window.sends=(window.sends||[]).concat([token]);if(window.failWarning){window.failWarning=false;throw new Error('network')}return {ok:true,receipt:{dispatchId:'one',channel:'EMAIL',status:'QUEUED',scheduledFor:'8 September 2026, 13:00 BST',duplicate:false}}}
    `}));
  }}]}); bundle=result.outputFiles[0].text;
  function files(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  css=files('.next/static').filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(p,'utf8')).join('\n');
  fs.mkdirSync('artifacts/player-warning',{recursive:true});
});
after(async()=>browser?.close());
async function pageAt(width){const context=await browser.newContext({viewport:{width,height:1000}});await context.route('**/*',route=>route.abort());const page=await context.newPage();await page.setContent('<html><body style="background:#07130f;color:white"><main id="root" style="max-width:850px;margin:auto;padding:16px"></main></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});return {context,page};}
for(const width of [1440,390]) test(`actual warning form requires preview and confirmation, safely cancels and queues only one individual (${width}px)`,async()=>{
  const {context,page}=await pageAt(width);try{
    await page.getByRole('button',{name:'Preview payment warning'}).waitFor();assert.equal(await page.evaluate(()=>window.sends?.length||0),0);
    await page.getByRole('button',{name:'Preview payment warning'}).click();
    const confirm=page.getByRole('button',{name:'Confirm and send warning'});await confirm.waitFor();assert.equal(await confirm.isEnabled(),false);
    assert.equal(await page.evaluate(()=>window.sends?.length||0),0);
    const iframe=page.getByTitle('Player payment warning email preview');assert.ok(await iframe.getAttribute('sandbox'));assert.ok(!(await iframe.getAttribute('sandbox')).includes('allow-same-origin'));
    await page.getByRole('checkbox').check();await page.getByLabel('Payment deadline (UK time)').fill('2026-09-11T18:00');assert.equal(await confirm.count(),0);
    await page.getByRole('button',{name:'Preview payment warning'}).click();await page.getByRole('button',{name:'Cancel preview'}).click();assert.equal(await confirm.count(),0);assert.equal(await page.evaluate(()=>window.sends?.length||0),0);
    await page.getByRole('button',{name:'Preview payment warning'}).click();await page.getByRole('checkbox').check();
    await page.screenshot({path:`artifacts/player-warning/preview-${width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await confirm.click();await page.getByRole('heading',{name:'Payment warning queued'}).waitFor();assert.equal(await page.evaluate(()=>window.sends.length),1);
    assert.match(await page.getByRole('status').innerText(),/Queued does not mean delivered/);
  }finally{await context.close();}
});
test('SMS choice resets the preview and a network retry keeps the identical signed confirmation',async()=>{
  const {context,page}=await pageAt(800);try{
    await page.getByRole('radio',{name:/SMS:/}).check();await page.getByRole('button',{name:'Preview payment warning'}).click();
    await page.getByText(/The payment URL will be shortened/).waitFor();assert.equal(await page.locator('iframe').count(),0);
    await page.getByRole('checkbox').check();await page.evaluate(()=>window.failWarning=true);await page.getByRole('button',{name:'Confirm and send warning'}).click();
    await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Confirm and send warning'}).click();await page.getByRole('heading',{name:'Payment warning queued'}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.sends),['signed-one','signed-one']);assert.equal((await page.evaluate(()=>window.previews))[0].feeId,'fee-one');
  }finally{await context.close();}
});
