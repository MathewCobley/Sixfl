const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const {build}=require('esbuild');const {chromium}=require(process.env.WARNING_PLAYWRIGHT_MODULE || 'playwright');let browser,bundle,css;
before(async()=>{
  browser=await chromium.launch({headless:true});
  bundle=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Status from './src/components/admin/payments/PlayerPaymentWarningStatus';import Refresh from './src/components/admin/payments/RefreshPaymentWarningStatus';
    const warning={id:'warning-one',channel:'Email',label:'Warning sent',tone:'sent',timestamp:'Sent: 08 Sept 2026, 12:30 BST',deadline:'10 Sept 2026, 18:00 BST',detail:'Accepted for sending; receipt by the player is not confirmed here.',failureReason:null};
    createRoot(document.getElementById('root')).render(<section><h1>Player match fees</h1><Refresh />{['fee-one','fee-two','fee-three'].map((id,i)=><article key={id} style={{padding:16,marginTop:12,border:'1px solid #555',borderRadius:16}}><h2>Test Player {i+1} · £6.00</h2><div>Last request/chase: 03 Sept, 00:05</div><Status feeId={id} warning={i===0?warning:i===1?{...warning,id:'warning-two',channel:'SMS',label:'Warning queued',tone:'pending',timestamp:'Queued: 08 Sept 2026, 12:29 BST',detail:'Not yet sent. Scheduled: 09 Sept 2026, 09:00 BST'}:null} showHistoryLink /><button>Send payment warning</button><button>Chase player</button></article>)}</section>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'readonly-history-test',setup(b){
    b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'isolated'}));
    b.onLoad({filter:/.*/,namespace:'isolated'},args=>({loader:'js',resolveDir:process.cwd(),contents:args.path==='next/link'?`import React from 'react';export default function Link(props){return React.createElement('a',props,props.children)}`:`export function useRouter(){return {refresh(){window.refreshCount=(window.refreshCount||0)+1}}}`}));
  }}]})).outputFiles[0].text;
  function files(d){return fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name)]):[];}
  css=files('.next/static').filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(p,'utf8')).join('\n');fs.mkdirSync('artifacts/warning-history',{recursive:true});
});after(async()=>browser?.close());
for(const width of [1440,390])test(`real warning badges show existing history and refresh only server data (${width}px)`,async()=>{
  const context=await browser.newContext({viewport:{width,height:1100}});let requests=0;await context.route('**/*',r=>{requests++;return r.abort();});const page=await context.newPage();
  try{await page.setContent('<html><body style="background:#160f00;color:white"><main id="root" style="max-width:900px;padding:16px;margin:auto"></main></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});
    await page.getByText('Warning sent · Email').waitFor();await page.getByText('Warning queued · SMS').waitFor();await page.getByText('Payment warning: none requested').waitFor();
    assert.equal(await page.locator('[data-payment-warning-fee-id="fee-one"] a').first().getAttribute('href'),'/admin/payments/player-warning?feeId=fee-one#warning-history');
    assert.equal(await page.getByRole('button',{name:'Chase player',exact:true}).count(),3);assert.equal(await page.evaluate(()=>window.refreshCount||0),0);
    await page.getByRole('button',{name:'Refresh warning status',exact:true}).click();assert.equal(await page.evaluate(()=>window.refreshCount),1);assert.equal(requests,0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`artifacts/warning-history/status-${width}.png`,fullPage:true});
  }finally{await context.close();}
});
