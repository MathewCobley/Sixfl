const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { build } = require('esbuild'), { chromium } = require(process.env.REFERRAL_PLAYWRIGHT || 'playwright');
(async () => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';import Panel from './src/components/admin/ReferralIneligibilityEmailPanelView';window.saved=[];const recorded=new URLSearchParams(location.search).has('sent');const panel={email:'referrer@example.invalid',subject:'Test eligibility update',body:'Example team: Existing or renamed team. No reward is payable.',error:null,record:recorded?{id:'dispatch',status:'SENT',failureReason:null}:null};createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-xl p-4"><Panel referralId="saved-decision" panel={panel} action={async data=>{window.saved.push(Object.fromEntries(data))}}/></main>);`;
  const js = (await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
  const css=[];const walk=d=>{for(const n of fs.readdirSync(d)){const f=path.join(d,n);if(fs.statSync(f).isDirectory())walk(f);else if(f.endsWith('.css'))css.push(fs.readFileSync(f,'utf8'))}};walk('.next/static');assert.ok(css.length);
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/app.js'?js:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.join('\n')}</style><div id="root"></div><script src="/app.js"></script>`)});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try {
    browser=await chromium.launch({headless:true});fs.mkdirSync('artifacts/referral-ineligibility-email',{recursive:true});
    for(const width of [390,1280]) {
      const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByText('Preview email',{exact:true}).click();
      await page.getByRole('button',{name:'Email referrer',exact:true}).click();assert.equal(await page.evaluate(()=>window.saved.length),0);
      await page.locator('input[name="confirmed"]').check();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:`artifacts/referral-ineligibility-email/catchup-${width}.png`,fullPage:true});
      await page.getByRole('button',{name:'Email referrer',exact:true}).click();await page.waitForFunction(()=>window.saved.length===1);
      assert.deepEqual(await page.evaluate(()=>window.saved[0]),{referralId:'saved-decision',confirmed:'yes'});
      await page.goto(`http://127.0.0.1:${server.address().port}?sent=1`);
      assert.equal(await page.getByRole('button',{name:'Email referrer',exact:true}).count(),0);
      assert.match(await page.locator('body').innerText(),/Status: Sent/);assert.deepEqual(errors,[]);await page.close();
      console.log(`PASS saved-decision preview, confirmed queue and sent state at ${width}px`);
    }
  } finally {await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
