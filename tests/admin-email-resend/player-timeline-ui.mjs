import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium, webkit } from 'playwright';

const output = '/tmp/sixfl-player-resend-browser';
const artifacts = 'artifacts/player-payment-resend';
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(artifacts, { recursive: true });
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Control from './src/components/admin/communications/PlayerPaymentEmailResend';
window.__submissions=[]; window.__refreshes=0;
createRoot(document.getElementById('root')).render(<Control teamId="test-team" membershipId="test-member" referenceType="message" referenceId="test-message" recipientEmail="player@example.invalid"/>);`;
await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, outfile: path.join(output, 'app.js'), platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'no-real-resends', setup(builder) {
    const mocks = {
      'next/navigation': `const router={refresh(){window.__refreshes++}};export const useRouter=()=>router;`,
      '@/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/resend-actions': `
        export async function resendPlayerPaymentEmailAction(_state,form) {
          window.__submissions.push([...form.entries()]);
          await new Promise(resolve=>setTimeout(resolve,150));
          return location.search.includes('blocked') ? {ok:false,message:'This payment is paid, waived or cancelled. No payment email was queued.'}
            : {ok:true,dispatchId:'synthetic-queue-receipt',message:'Payment email queued to resend. The original message and payment are unchanged.'};
        }`,
    };
    builder.onResolve({filter:/.*/}, args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'test-only'}:null);
    builder.onLoad({filter:/.*/,namespace:'test-only'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const css = await postcss([tailwind()]).process('@import "tailwindcss";', { from:path.resolve('resend-browser.css') });
fs.writeFileSync(path.join(output,'app.css'),css.css);
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#07140f;color:white;font-family:Arial,sans-serif}main{max-width:600px;margin:24px auto;padding:16px;min-width:0}</style></head><body><main id="root"></main><script src="/app.js"></script></body></html>';
const server=createServer((request,response)=>{
  const file={'/app.js':'app.js','/app.css':'app.css'}[request.url];
  response.setHeader('Content-Type',file?(file.endsWith('.js')?'text/javascript':'text/css'):'text/html');
  response.end(file?fs.readFileSync(path.join(output,file)):html);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const url=`http://127.0.0.1:${server.address().port}`;
try {
  for(const engine of [chromium,webkit]) {
    const browser=await engine.launch({headless:true});
    try {
      for(const width of [390,1360]) {
        const page=await browser.newPage({viewport:{width,height:844}}), errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
        try {
          await page.goto(url);
          const button=page.getByRole('button',{name:'Resend payment email',exact:true});
          await button.waitFor();
          assert.equal(await page.locator('form').evaluate(form=>form.checkValidity()),false);
          await button.click();
          assert.equal(await page.evaluate(()=>window.__submissions.length),0,'Unconfirmed form must not resend');
          await page.getByRole('checkbox').check();
          const box=await button.boundingBox();
          assert.ok(box && box.height>=43 && box.x>=0 && box.x+box.width<=width+1);
          await button.click();
          await page.getByRole('status').waitFor();
          assert.equal(await page.getByRole('button',{name:'Resend recorded',exact:true}).isDisabled(),true);
          assert.match(await page.getByRole('status').textContent(),/queued to resend/);
          const submissions=await page.evaluate(()=>window.__submissions);
          assert.equal(submissions.length,1);
          assert.deepEqual(Object.fromEntries(submissions[0]),{
            teamId:'test-team',membershipId:'test-member',referenceType:'message',referenceId:'test-message',expectedEmail:'player@example.invalid',confirmed:'on',
          });
          assert.equal(await page.evaluate(()=>window.__refreshes),1);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
          assert.deepEqual(errors,[]);
          await page.screenshot({path:`${artifacts}/${engine.name()}-${width}.png`});
          await page.goto(`${url}/?blocked=1`);
          await page.getByRole('checkbox').check();
          await page.getByRole('button',{name:'Resend payment email',exact:true}).click();
          await page.getByRole('alert').waitFor();
          assert.match(await page.getByRole('alert').textContent(),/No payment email was queued/);
          assert.equal(await page.getByRole('button',{name:'Resend payment email',exact:true}).isDisabled(),false);
          assert.equal(await page.evaluate(()=>window.__refreshes),0);
          console.log(`${engine.name()} ${width}px: confirmation required, single captured submission, queued/blocked feedback visible`);
        }catch(error){await page.screenshot({path:`${artifacts}/${engine.name()}-${width}-failure.png`});throw error;}
        finally{await page.close();}
      }
    }finally{await browser.close();}
  }
}finally{server.close();}
