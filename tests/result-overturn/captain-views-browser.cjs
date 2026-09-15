const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.OVERTURN_PLAYWRIGHT || 'playwright');
const { renderCaptainView } = require('./captain-view-fixtures.cjs');

(async () => {
  const pages = new Map();
  for (const kind of ['overview', 'history']) for (const teamid of ['nomads', 'under']) {
    pages.set(`/${kind}/${teamid}`, (await renderCaptainView({ kind, teamid })).rowHtml);
  }
  const css = [];
  function walk(dir) { for (const name of fs.readdirSync(dir)) { const file = path.join(dir, name); if (fs.statSync(file).isDirectory()) walk(file); else if (file.endsWith('.css')) css.push(fs.readFileSync(file, 'utf8')); } }
  walk('.next/static'); assert.ok(css.length, 'real production CSS is required');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#080d14;margin:0}${css.join('\n')}</style></head><body><main class="mx-auto max-w-xl p-3 text-white"><div class="rounded-3xl border border-white/10 bg-white/[0.04]">${pages.get(req.url) || ''}</div></main></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = 'artifacts/result-overturn'; fs.mkdirSync(dir, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [320, 390, 1280]) for (const [url] of pages) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}${url}`);
      const text = await page.locator('body').innerText();
      assert.match(text, /Northallerton Nomads 1–4 Under Sixes/);
      assert.match(text, /Northallerton Nomads 3–0 Under Sixes/);
      assert.match(text, /Player-limit breach/); assert.doesNotMatch(text, /SECRET_/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${url} ${width} must not overflow`);
      await page.screenshot({ path: `${dir}/captain-${url.slice(1).replace('/', '-')}-${width}.png`, fullPage: true });
      await page.close();
      console.log(`PASS ${url} at ${width}px: actual route output, both scores and safe public reason`);
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
