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
      const row=page.locator('[data-player-contribution-pence]').nth(3);
      assert.match(await row.innerText(),/£8.00[\s\S]*Contribution to fixture[\s\S]*£5.00 received online \+ £3.00 SIXFL adjustment/);
      await page.screenshot({path:path.join(out,`ledger-${width}.png`),fullPage:true});
      await page.close();
    }
  } finally {await browser.close();}
});
