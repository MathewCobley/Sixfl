const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYER_ORDER_PLAYWRIGHT || 'playwright');
const { renderDashboard, assertCoreFirst } = require('./contract.test.cjs');

(async () => {
  const out = '.tmp/player-dashboard-order';
  fs.mkdirSync(out, { recursive: true });
  const cssFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.css')) cssFiles.push(file);
    }
  }
  walk('.next/static');
  const css = cssFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const role of ['PLAYER', 'ADMIN']) {
      const { html } = await renderDashboard({ role, preview: role === 'ADMIN' });
      assertCoreFirst(html);
      for (const width of [390, 1440, 1920]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        await page.route('**/*', route => route.abort());
        await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="bg-[#07130f] text-white">${html}</body></html>`);
        const bounds = await page.evaluate(() => {
          const y = selector => document.querySelector(selector).getBoundingClientRect().top;
          return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, header: y('h1'), coreBottom: document.querySelector('main').getBoundingClientRect().bottom, news: y('[aria-label="Latest League News"]'), goals: y('[data-order-panel="goals"]'), media: y('[data-order-panel="media"]') };
        });
        assert.ok(bounds.header >= 0 && bounds.header < 500, 'Team heading must be near the top at every viewport');
        assert.ok(bounds.news >= bounds.coreBottom - 1 && bounds.goals >= bounds.coreBottom - 1);
        assert.ok(bounds.scrollWidth <= width + 1, 'No full-page horizontal overflow');
        // Late-loading long stories or nominees cannot shift preceding core content.
        await page.locator('[aria-label="Latest League News"]').evaluate(element => { element.style.minHeight = '1400px'; });
        const afterGrowth = await page.locator('h1').boundingBox();
        assert.equal(afterGrowth.y, bounds.header);
        fs.writeFileSync(`${out}/${role}-${width}.json`, JSON.stringify(bounds, null, 2));
        await page.screenshot({ path: `${out}/${role}-${width}.png`, fullPage: false });
        await page.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
