const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.REFERRAL_PLAYWRIGHT || 'playwright');
const { renderReferralLayout } = require('./layout-fixture.cjs');

(async () => {
  const { html } = await renderReferralLayout();
  const css = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else if (file.endsWith('.css')) css.push(fs.readFileSync(file, 'utf8'));
    }
  }
  walk('.next/static');
  assert.ok(css.join('').includes('.sixfl-referral-summary'), 'layout CSS must exist in the real production build');
  const server = http.createServer((req, res) => {
    const sidebar = !req.url.includes('wide');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Match the real admin shell, including the wide sidebar above 1280px.
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.join('\n')}body{margin:0;background:#f8fafc}</style></head><body><div class="flex w-full gap-5 px-3 py-4 sm:px-6 lg:px-8 lg:py-6">${sidebar ? '<aside class="hidden w-[34rem] shrink-0 xl:block 2xl:w-[38rem]">Test sidebar</aside>' : ''}<main class="w-full min-w-0 flex-1">${html}</main></div></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = 'artifacts/referral-ineligibility-email';
  fs.mkdirSync(dir, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [390, 768, 1100, 1280, 1440, 1920]) {
      for (const variant of ['sidebar', 'wide']) {
        const page = await browser.newPage({ viewport: { width, height: 1100 } });
        try {
          await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
          await page.goto(`http://127.0.0.1:${server.address().port}/${variant}`);
          const card = page.locator('.sixfl-referral-card').first();
          await card.getByText('View recorded email', { exact: true }).click();
          const layout = await card.evaluate(el => {
            const summary = el.querySelector('.sixfl-referral-summary');
            const details = el.querySelector('.sixfl-referral-details');
            const panel = details.querySelector('section');
            const main = el.closest('main');
            const rect = n => ({ x: n.getBoundingClientRect().x, width: n.getBoundingClientRect().width });
            return { card: rect(el), main: rect(main), summary: rect(summary), details: rect(details), panel: rect(panel),
              detailPadding: parseFloat(getComputedStyle(details).paddingLeft),
              columns: getComputedStyle(summary).gridTemplateColumns.split(' ').length,
              viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
              panelText: panel.innerText };
          });
          assert.ok(Math.abs(layout.card.width - layout.main.width) < 4, `${width}/${variant}: card uses full main width`);
          assert.ok(Math.abs(layout.details.width - layout.summary.width) < 2, `${width}/${variant}: decision spans full summary width`);
          assert.ok(Math.abs(layout.details.x - layout.summary.x) < 2, `${width}/${variant}: aligned decision`);
          assert.ok(layout.panel.width > layout.details.width - 2 * layout.detailPadding - 4, `${width}/${variant}: full-width email panel`);
          assert.ok(layout.scrollWidth <= layout.viewport + 1, `${width}/${variant}: no horizontal overflow`);
          const expected = layout.summary.width >= 1024 ? 4 : layout.summary.width >= 640 ? 2 : 1;
          assert.equal(layout.columns, expected, `${width}/${variant}: container-based columns`);
          assert.doesNotMatch(layout.panelText, /PRIVATE_LAYOUT_SENTINEL/);
          assert.match(layout.panelText, /Status: Queued/);
          assert.equal(await card.getByRole('button', { name: 'Email referrer', exact: true }).count(), 0, 'queued notice cannot be resent');
          await card.screenshot({ path: `${dir}/layout-${variant}-${width}.png` });
          console.log(`PASS full admin route ${width}px/${variant}: ${layout.columns} columns, full-width decision/email and queued status preserved`);
        } catch (error) {
          await page.screenshot({ path: `${dir}/layout-failure-${variant}-${width}.png`, fullPage: true });
          throw error;
        } finally { await page.close(); }
      }
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
