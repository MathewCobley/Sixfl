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
window.__submissions=[]; window.__refreshes=0; window.__completeResend=null;
function Harness(){
  const [other,setOther]=React.useState(false);
  return <><Control teamId="test-team" membershipId={other?'other-member':'test-member'} referenceType="message" referenceId={other?'other-message':'test-message'} recipientEmail={other?'other@example.invalid':'player@example.invalid'}/>
    <p data-testid="history">Saved message preview remains visible</p>
    <button type="button" onClick={()=>setOther(true)}>Open another player</button></>;
}
createRoot(document.getElementById('root')).render(<Harness/>);`;
await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, outfile: path.join(output, 'app.js'), platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'no-real-resends', setup(builder) {
    const mocks = {
      'next/navigation': `const router={refresh(){window.__refreshes++}};export const useRouter=()=>router;`,
      '@/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/resend-actions': `
        export async function resendPlayerPaymentEmailAction(_state,form) {
          window.__submissions.push([...form.entries()]);
          await new Promise(resolve=>{window.__completeResend=resolve});
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
          const disclosure=page.locator('details'), toggle=page.locator('summary');
          const button=page.getByRole('button',{name:'Resend payment email',exact:true});
          await toggle.waitFor();
          assert.equal(await toggle.textContent().then(text=>text.includes('Resend options')),true);
          assert.equal(await disclosure.getAttribute('open'),null);
          assert.equal(await page.locator('form').isVisible(),false);
          assert.equal(await page.getByTestId('history').isVisible(),true);
          const compact=await disclosure.boundingBox(), toggleBox=await toggle.boundingBox();
          assert.ok(compact && compact.height<=60,'Initially only one compact button occupies space');
          assert.ok(toggleBox && toggleBox.height>=43 && toggleBox.x>=0 && toggleBox.x+toggleBox.width<=width+1);
          await page.screenshot({path:`${artifacts}/${engine.name()}-${width}-collapsed.png`});
          await toggle.click();
          await button.waitFor();
          assert.equal(await disclosure.evaluate(el=>el.open),true);
          await toggle.click();
          assert.equal(await page.locator('form').isVisible(),false);
          await toggle.focus(); await toggle.press('Enter');
          await button.waitFor();
          await toggle.press('Space');
          assert.equal(await page.locator('form').isVisible(),false);
          assert.equal(await page.evaluate(()=>window.__submissions.length),0,'Expanding/collapsing must never send');
          await toggle.press('Enter'); await button.waitFor();
          assert.equal(await page.locator('form').evaluate(form=>form.checkValidity()),false);
          await button.click();
          assert.equal(await page.evaluate(()=>window.__submissions.length),0,'Unconfirmed form must not resend');
          await page.getByRole('checkbox').check();
          const box=await button.boundingBox();
          assert.ok(box && box.height>=43 && box.x>=0 && box.x+box.width<=width+1);
          await page.screenshot({path:`${artifacts}/${engine.name()}-${width}-expanded.png`});
          await button.click();
          await page.getByRole('button',{name:'Queuing…',exact:true}).waitFor();
          assert.equal(await page.getByRole('checkbox').isDisabled(),true);
          assert.equal(await page.getByRole('button',{name:'Queuing…',exact:true}).isDisabled(),true);
          // Close while pending, then finish the isolated action. Feedback stays visible.
          await toggle.click();
          await page.evaluate(()=>window.__completeResend());
          await page.getByRole('status').waitFor();
          assert.equal(await page.locator('form').isVisible(),false);
          assert.equal(await page.locator('form button').isDisabled(),true);
          assert.match(await page.getByRole('status').textContent(),/queued to resend/);
          const submissions=await page.evaluate(()=>window.__submissions);
          assert.equal(submissions.length,1);
          assert.deepEqual(Object.fromEntries(submissions[0]),{
            teamId:'test-team',membershipId:'test-member',referenceType:'message',referenceId:'test-message',expectedEmail:'player@example.invalid',confirmed:'on',
          });
          await page.waitForFunction(()=>window.__refreshes===1);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
          assert.equal(await page.getByTestId('history').isVisible(),true);
          await page.screenshot({path:`${artifacts}/${engine.name()}-${width}.png`});
          // Re-open, then reuse the mounted component with a different player.
          await toggle.click();
          await page.getByRole('button',{name:'Resend recorded',exact:true}).waitFor();
          await page.getByRole('button',{name:'Open another player',exact:true}).click();
          assert.equal(await disclosure.evaluate(el=>el.open),false);
          assert.equal(await page.getByRole('status').count(),0);
          await toggle.click(); await button.waitFor();
          assert.equal(await page.getByRole('checkbox').isChecked(),false);
          assert.equal(await page.getByRole('checkbox').isDisabled(),false);
          assert.equal(await button.isDisabled(),false);
          assert.equal(await page.locator('input[name="membershipId"]').inputValue(),'other-member');
          assert.equal(await page.locator('input[name="expectedEmail"]').inputValue(),'other@example.invalid');
          assert.equal(await page.evaluate(()=>window.__submissions.length),1);
          await page.goto(`${url}/?blocked=1`);
          await toggle.click();
          await page.getByRole('checkbox').check();
          await page.getByRole('button',{name:'Resend payment email',exact:true}).click();
          await page.getByRole('button',{name:'Queuing…',exact:true}).waitFor();
          await toggle.click(); await page.evaluate(()=>window.__completeResend());
          await page.getByRole('alert').waitFor();
          assert.match(await page.getByRole('alert').textContent(),/No payment email was queued/);
          assert.equal(await page.locator('form').isVisible(),false);
          assert.equal(await page.locator('form button').isDisabled(),false);
          assert.equal(await page.evaluate(()=>window.__refreshes),0);
          assert.deepEqual(errors,[]);
          console.log(`${engine.name()} ${width}px: collapsed by default, mouse/Enter/Space toggle, no accidental sends, confirmed single submit, pending/queued/blocked feedback and player-context reset`);
        }catch(error){await page.screenshot({path:`${artifacts}/${engine.name()}-${width}-failure.png`});throw error;}
        finally{await page.close();}
      }
    }finally{await browser.close();}
  }
}finally{server.close();}
