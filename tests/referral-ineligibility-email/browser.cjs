const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { build } = require('esbuild'), { chromium } = require(process.env.REFERRAL_PLAYWRIGHT || 'playwright');
(async () => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';import Panel from './src/components/admin/ReferralIneligibilityEmailPanelView';window.saved=[];const recorded=new URLSearchParams(location.search).has('sent');const panel={email:'referrer@example.invalid',subject:'Test eligibility update',body:'Example team: Existing or renamed team. No reward is payable.',error:null,record:recorded?{id:'dispatch',status:'SENT',failureReason:null}:null};createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-xl p-4"><Panel referralId="saved-decision" panel={panel} action={async data=>{window.saved.push(Object.fromEntries(data))}}/></main>);`;
  const js = (await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
  const css=[];const walk=d=>{for(const n of fs.readdirSync(d)){const f=path.join(d,n);if(fs.statSync(f).isDirectory())walk(f);else if(f.endsWith('.css'))css.push(fs.readFileSync(f,'utf8'))}};walk('.next/static');assert.ok(css.length);
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/app.js'?js:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.join('\n')}</style><div id="root"></div><script src="/app.js"></script>`)});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const dir='artifacts/referral-ineligibility-email';fs.mkdirSync(dir,{recursive:true});
  try {
    browser=await chromium.launch({headless:true});
    for(const width of [390,1280]) {
      const page=await browser.newPage({viewport:{width,height:900}});const errors=[];
      page.on('pageerror',e=>{errors.push(e.message);console.error('Browser runtime error:',e.stack||e.message)});
      try {
        await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.getByRole('heading',{name:'Referrer update email',exact:true}).waitFor({state:'visible',timeout:10000});
        await page.getByText('Preview email',{exact:true}).click();
        await page.getByRole('button',{name:'Email referrer',exact:true}).click();assert.equal(await page.evaluate(()=>window.saved.length),0);
        await page.locator('input[name="confirmed"]').check();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await page.screenshot({path:`${dir}/catchup-${width}.png`,fullPage:true});
        await page.getByRole('button',{name:'Email referrer',exact:true}).click();await page.waitForFunction(()=>window.saved.length===1);
        assert.deepEqual(await page.evaluate(()=>window.saved[0]),{referralId:'saved-decision',confirmed:'yes'});
        await page.goto(`http://127.0.0.1:${server.address().port}?sent=1`);
        await page.getByText('Status: Sent',{exact:true}).waitFor({state:'visible',timeout:10000});
        assert.equal(await page.getByRole('button',{name:'Email referrer',exact:true}).count(),0);
        assert.equal(await page.getByRole('link',{name:'View message status'}).getAttribute('href'),'/admin/queue/dispatch');
        assert.deepEqual(errors,[]);
        console.log(`PASS saved-decision preview, confirmed queue and sent state at ${width}px`);
      } catch(error) {
        console.error('Browser details:',{width,errors,body:await page.locator('body').innerText()});
        await page.screenshot({path:`${dir}/failure-${width}.png`,fullPage:true});
        fs.writeFileSync(`${dir}/failure-${width}.html`,await page.content());
        throw error;
      } finally {await page.close();}
    }
  } finally {await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
