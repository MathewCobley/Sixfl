import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// The real production component, isolated from auth and money using localhost-only API fixtures.
const bundled = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import GuestPaymentControl from './src/components/captain/GuestPaymentControl'; createRoot(document.getElementById('root')).render(<GuestPaymentControl teamId="home" fixtureId="fixture" approvalId="approval" revision={1} approvalStatus="APPROVED" playerName="Guest Player" />);`, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{name:'next-navigation-test',setup(builder){
    builder.onResolve({filter:/^next\/navigation$/},()=>({path:'next-navigation',namespace:'test'}));
    builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const useRouter = () => ({ refresh() {} });',loader:'js'}));
  }}],
});
const server = createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundled.outputFiles[0].text);}
  else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
});
server.listen(0,'127.0.0.1'); await once(server,'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[]; page.on('pageerror',error=>errors.push(error.message));
let state; let calls; let failQueue=false;
const base=()=>({canManage:true,editable:true,hasEmail:true,conflict:false,revision:1,kickoffAt:'2026-10-01T18:00:00.000Z',approvalStatus:'APPROVED',fee:null,delivery:null});
await page.route('**/api/captain/team/home/guest-payments*',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:state});return;}
  const body=route.request().postDataJSON(); calls.push(body);
  assert.equal(body.fixtureId,'fixture'); assert.equal(body.approvalId,'approval');
  assert.equal(body.expectedRevision,1); assert.equal('passCode' in body,false);
  if(body.action==='create') state.fee={id:'fee',amountPence:Math.round(Number(body.amount)*100),status:Number(body.amount)===0?'WAIVED':'OPEN',paymentUrl:`${origin}/pay/player-match-fee/test`};
  let status=state.fee.status==='WAIVED'?'no_fee':failQueue?'failed':'queued';
  state.delivery=status==='queued'?{status:'QUEUED',sentAt:null,createdAt:new Date().toISOString()}:null;
  await route.fulfill({json:{ok:true,feeId:state.fee.id,amountPence:state.fee.amountPence,status:state.fee.status,paymentRequest:{status}}});
});
async function load(next=base()) {state=next;calls=[];await page.goto(origin);await page.getByText('Loading payment details…').waitFor({state:'hidden'});}
try {
  await load();
  assert.equal(await page.getByRole('spinbutton').inputValue(),'');
  await page.getByRole('spinbutton').fill('6.25');
  await page.getByRole('button',{name:'Create fee and send payment link',exact:true}).click();
  await page.getByText('Guest fee saved. Payment-link email queued.').waitFor();
  assert.equal(calls.length,1);assert.equal(calls[0].amount,'6.25');
  assert.equal(await page.getByRole('button',{name:'Email queued / sent',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('link',{name:'Open payment link',exact:true}).count(),1);
  console.log('PASS: create agreed guest fee and queue without a player pass.');

  await load();await page.getByRole('spinbutton').fill('0');
  await page.getByRole('button',{name:'Save £0 — no payment needed',exact:true}).click();
  await page.getByText('No player payment is due. No payment email was sent.').waitFor();
  assert.equal(state.fee.status,'WAIVED');assert.equal(state.delivery,null);
  console.log('PASS: explicit zero does not send a payment request.');

  await load({...base(),fee:{id:'fee',amountPence:625,status:'PAID',paymentUrl:null}});
  assert.equal(await page.getByRole('spinbutton').count(),0);
  assert.equal(await page.getByRole('button',{name:'Send payment link',exact:true}).count(),0);
  console.log('PASS: paid fees cannot be recreated.');

  await load({...base(),canManage:false});
  assert.equal(await page.getByRole('spinbutton').count(),0);
  await load({...base(),approvalStatus:'REVOKED',editable:false});
  assert.equal(await page.getByRole('spinbutton').count(),0);
  await load({...base(),hasEmail:false});await page.getByRole('spinbutton').fill('6');
  assert.equal(await page.getByRole('button',{name:'Create fee and send payment link',exact:true}).isDisabled(),true);
  console.log('PASS: preview/revoked/no-email states do not expose payable creation.');

  failQueue=true;await load();await page.getByRole('spinbutton').fill('5');
  await page.getByRole('button',{name:'Create fee and send payment link',exact:true}).click();
  await page.getByText(/The guest fee is saved, but the payment email was not queued/).waitFor();
  failQueue=false;await page.getByRole('button',{name:'Send payment link',exact:true}).click();
  await page.getByText('Guest fee saved. Payment-link email queued.').waitFor();
  assert.deepEqual(calls.map(call=>call.action),['create','send']);assert.equal(calls[1].feeId,'fee');
  console.log('PASS: queue failure retries the same fee, not another creation.');
  assert.deepEqual(errors,[]);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
