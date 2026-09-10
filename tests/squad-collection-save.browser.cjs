const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {build}=require('esbuild');const {chromium}=require(process.env.SQUAD_PLAYWRIGHT_MODULE||'playwright');
let browser,server,origin;
before(async()=>{
 const source=fs.readFileSync('src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx','utf8');
 const start=source.indexOf('<SquadPaymentCollectionForm'),end=source.indexOf('</SquadPaymentCollectionForm>',start)+'</SquadPaymentCollectionForm>'.length;
 assert.ok(start>=0&&end>start);const jsx=source.slice(start,end);
 const contents=`import React from 'react';import {createRoot} from 'react-dom/client';import SquadPaymentCollectionForm from './src/components/payments/SquadPaymentCollectionForm';import {getInitialCollectionDefaultPence} from './src/lib/payments/squad-collection-form';
 const root=createRoot(document.getElementById('root'));window.calls=[];window.mode='hold';
 const createCaptainSquadPaymentCollectionAction=async()=>{throw Error('Fallback must not run in hydrated test')};
 const saveCaptainSquadPaymentCollectionWithFeedback=async(data)=>{window.calls.push([...data.entries()]);if(window.mode==='hold')return new Promise(r=>window.finish=r);if(window.mode==='reject')return {status:'error',message:'Synthetic server rejection — review this collection.'};if(window.mode==='throw')throw Error('Synthetic lost acknowledgement');return {status:'saved',message:'Player collection saved. 8 payment link emails queued — not yet confirmed delivered.'};};
 const Link=({children,...p})=><a {...p}>{children}</a>;const fixtureTitle=()=> 'Test Team vs Test Opponent';const formatDateTime=()=> 'Test fixture';
 const collectionMethod=(status)=>status==='WAIVED'?'waived':'link';const team={id:'team'};const teamid='team';
 const ledgerByFee=new Map([['protected',{controlled:true}]]);
 const playersForForm=[{kind:'member',id:'zero',value:'member:zero',label:'No charge player',emailRequired:false,checked:false,fee:{id:'zero',status:'WAIVED',amountPence:0}},...Array.from({length:8},(_,i)=>({kind:'member',id:'m'+(i+1),value:'member:m'+(i+1),label:'Player '+(i+1),contact:'player'+(i+1)+'@example.invalid',emailRequired:false,checked:true,fee:{id:'fee-'+i,status:'OPEN',amountPence:500}})),{kind:'member',id:'locked',value:'member:locked',label:'Protected player',emailRequired:false,checked:true,fee:{id:'protected',status:'OPEN',amountPence:500}}];
 const defaultAmount=getInitialCollectionDefaultPence(playersForForm.map(p=>p.fee));
 function Sample({id}){const selectedFixture={id,kickoffAt:new Date(),venue:{name:'Test Venue'}};return (${jsx});}
 window.show=(id='fixture')=>root.render(<Sample id={id}/>);window.show();`;
 const bundle=(await build({stdin:{contents,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',plugins:[{name:'router-only',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export function useRouter(){return {refresh(){window.refreshCount=(window.refreshCount||0)+1}}}'}));}}]})).outputFiles[0].text;
 const files=d=>fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name)]):[];
 const css=files('.next/static').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(f,'utf8')).join('\n');
 assert.ok(css.length,'Build production CSS before browser tests');fs.mkdirSync('.tmp/squad-save',{recursive:true});
 server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(bundle);}else if(req.url==='/app.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body style="background:#06120d;color:white"><main id="root" style="padding:16px;max-width:900px;margin:auto"></main><script src="/app.js"></script></body></html>');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
for(const width of [1440,390])test(`real owning form at ${width}px: zero default, pending, failure retention, protected rows and no replay`,async()=>{
 const page=await browser.newPage({viewport:{width,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 try{
  await page.goto(origin);const defaultField=page.getByLabel('Default amount per player');await defaultField.waitFor();assert.equal(await defaultField.inputValue(),'5.00');
  assert.equal(await page.getByLabel('Amount for Protected player').isDisabled(),true);
  await defaultField.fill('0');await page.getByRole('button',{name:'Save player collection',exact:true}).click();
  const pending=page.getByRole('button',{name:'Saving player collection…',exact:true});await pending.waitFor();assert.equal(await pending.isDisabled(),true);
  await page.locator('form').evaluate(form=>{for(let i=0;i<3;i++)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  assert.equal(await page.evaluate(()=>window.calls.length),1);
  const entries=await page.evaluate(()=>window.calls[0]);assert.equal(entries.filter(([key])=>key==='player').length,8);assert.ok(!entries.some(([key,value])=>value==='member:locked'||key==='amount_member_locked'));
  await page.evaluate(()=>window.finish({status:'saved',message:'Player collection saved. 8 payment link emails queued — not yet confirmed delivered.'}));await page.getByText(/Player collection saved\. 8/).waitFor();assert.equal(await defaultField.inputValue(),'0');assert.equal(await page.getByLabel('Amount for Player 8',{exact:true}).inputValue(),'5.00');
  // An invalid required default is explained by Save, never a silent browser block.
  await page.getByLabel('Amount for Player 8',{exact:true}).fill('');await page.getByRole('button',{name:'Save player collection',exact:true}).click();await page.getByRole('alert').filter({hasText:/positive default/}).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),1);
  await page.getByLabel('Amount for Player 8',{exact:true}).fill('5.001');await defaultField.fill('5');await page.getByRole('button',{name:'Save player collection',exact:true}).click();await page.getByRole('alert').filter({hasText:/fractions of a penny/}).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),1);
  // Defaults/unselected controls are irrelevant if every selected amount is explicit.
  await page.getByLabel('Amount for Player 8',{exact:true}).fill('5.00');await defaultField.fill('');await page.getByLabel('Amount for No charge player',{exact:true}).fill('-12');await page.evaluate(()=>window.mode='reject');
  await page.getByRole('button',{name:'Save player collection',exact:true}).click();await page.getByRole('alert').filter({hasText:/Synthetic server rejection/}).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),2);assert.equal(await defaultField.inputValue(),'');assert.equal(await page.getByLabel('Amount for Player 8',{exact:true}).inputValue(),'5.00');
  const feedback=page.getByRole('alert');await feedback.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.tmp/squad-save/feedback-'+width+'.png',fullPage:true});
  await page.evaluate(()=>window.mode='throw');await page.getByRole('button',{name:'Save player collection',exact:true}).click();await page.getByRole('alert').filter({hasText:/Save could not be confirmed/}).waitFor();assert.equal(await page.getByRole('button',{name:'Save player collection',exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('Amount for Player 8',{exact:true}).inputValue(),'5.00');
  await page.getByRole('link',{name:'Open saved collection to check'}).waitFor();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.calls.length),3,'never replay uncertain writes');
  await page.evaluate(()=>window.show('another-fixture'));await page.getByRole('button',{name:'Save player collection',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Save player collection',exact:true}).isDisabled(),false);assert.equal(await defaultField.inputValue(),'5.00');assert.equal(await page.getByRole('alert').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
