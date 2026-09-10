const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.LEDGER_PLAYWRIGHT_MODULE||'playwright');
const out=path.join(process.cwd(),'.tmp/ledger-consistency');
function cssFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?cssFiles(path.join(dir,e.name)):e.name.endsWith('.css')?[path.join(dir,e.name)]:[]);}
test('actual prepared page markup and production CSS reconcile at desktop and mobile widths',async()=>{
  const files=cssFiles('.next/static');assert.ok(files.length,'Production CSS required');
  const css=files.map(p=>fs.readFileSync(p,'utf8')).join('\n');
  const markup=fs.readFileSync(path.join(out,'rendered.html'),'utf8');
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [1440,1280,390]){
      const page=await browser.newPage({viewport:{width,height:1000}});
      await page.route('**/*',route=>route.abort());
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="bg-black text-white"><main class="mx-auto max-w-7xl px-4 py-8">${markup}</main></body></html>`);
      const values=await page.locator('[data-player-contribution-pence]').evaluateAll(rows=>rows.map(r=>Number(r.getAttribute('data-player-contribution-pence'))));
      assert.deepEqual(values,[800,800,800,800,500]);
      assert.equal(values.reduce((a,b)=>a+b,0),Number(await page.locator('[data-player-settled-pence]').getAttribute('data-player-settled-pence')));
      assert.match(await page.locator('[data-current-settlement]').innerText(),/£37.00 applied to £40.00 charge; £3.00 outstanding/);
      assert.match(await page.locator('[data-player-cash-pence]').innerText(),/£18.00/);
      assert.match(await page.locator('[data-player-adjustments-pence]').innerText(),/£19.00/);
      assert.doesNotMatch(await page.locator('body').innerText(),/Covered by player shares totalling/);
      const overflow=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));
      assert.ok(overflow.document<=overflow.viewport+1,`Ledger overflows at ${width}: ${JSON.stringify(overflow)}`);
      const subtotalAmount=page.locator('[data-player-contributions-total] > span').last();
      assert.equal(await subtotalAmount.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap','Currency total must not split across lines');
      assert.match(await page.locator('[data-readable-player-payments]').innerText(),/Paid to captain/);
      assert.equal(await page.locator('[data-fixture-equation]').count(),1);
      const row=page.locator('[data-player-contribution-pence]').nth(3);
      assert.match(await row.innerText(),/£8.00[\s\S]*£5.00 received \+ £3.00 adjustment/);
      await page.screenshot({path:path.join(out,`ledger-${width}.png`),fullPage:true});
      await page.close();
    }
  } finally {await browser.close();}
});


test('receipt groups, captain reports and the £56 breakdown are readable at desktop and phone widths',async()=>{
  const css=cssFiles('.next/static').map(p=>fs.readFileSync(p,'utf8')).join('\n');const browser=await chromium.launch({headless:true});
  try{for(const width of [1440,390])for(const scenario of ['modern-receipts','captain-records','two-charge-balance']){
    const page=await browser.newPage({viewport:{width,height:1000}});await page.route('**/*',r=>r.abort());
    const markup=fs.readFileSync(path.join(out,scenario+'.html'),'utf8');
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="bg-black text-white"><main class="mx-auto max-w-7xl px-4 py-8">${markup}</main></body></html>`);
    const detail=page.locator('[data-payment-receipt-details]');for(let i=0;i<await detail.count();i++)await detail.nth(i).locator('summary').click();
    if(scenario!=='captain-records'){assert.equal(await page.locator('[data-receipt-kind="PLAYER"]').count(),4);assert.equal(await page.locator('[data-receipt-kind="TEAM"]').count(),0);}
    if(scenario==='captain-records'){assert.match(await page.locator('[data-captain-reported-pence]').innerText(),/£35.00/);assert.match(await page.locator('[data-player-collection-excess]').innerText(),/£48.00/);}
    if(scenario==='two-charge-balance'){const values=await page.locator('[data-due-pence]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('data-due-pence'))));assert.equal(values.reduce((a,b)=>a+b,0),5600);}
    const sizing=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert.ok(sizing[0]<=sizing[1]+1,`${scenario} overflow at ${width}: ${sizing}`);
    await page.screenshot({path:path.join(out,`${scenario}-${width}.png`),fullPage:true});await page.close();
  }}finally{await browser.close();}
});
