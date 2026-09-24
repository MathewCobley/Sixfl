const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');

async function main() {
  const root = process.cwd();
  const output = path.resolve('artifacts/admin-activity');
  fs.mkdirSync(output, { recursive: true });
  const result = await build({
    absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import Feed from './src/components/admin/AdminLatestActivity';
      const root = createRoot(document.getElementById('root'));
      window.showActivity = (count) => root.render(<Feed key={count} items={Array.from({length: count}, (_, index) => ({
        id: 'event-' + (index + 1), title: 'Action ' + (index + 1),
        href: '/admin/payments?teamId=test&view=playerFees',
        detail: 'NEO Mercy · player match fee', kindLabel: 'Player payment',
        tone: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
        occurredAt: '2026-09-24T12:27:00.000Z', occurredAtLabel: 'Thu 24 Sept, 13:27', relativeLabel: '1h ago'
      }))} />);
      window.showActivity(50);
    ` },
    plugins: [{ name: 'inert-next-link', setup(b) {
      b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'test-link' }));
      b.onLoad({ filter: /.*/, namespace: 'test-link' }, () => ({
        contents: "import React from 'react'; export default function Link(props) { return React.createElement('a', props); }",
        loader: 'jsx', resolveDir: root,
      }));
    } }],
  });
  const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(
    `@import "${path.join(root, 'node_modules/tailwindcss/index.css')}";\n@source "${path.join(root, 'src/components/admin/AdminLatestActivity.tsx')}";\nbody { margin: 0; padding: 16px; background: #090b0a; color: white; font-family: Arial, sans-serif; }`,
    { from: path.join(root, 'activity-test.css') },
  );
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].text); return; }
    if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><h1>Latest activity</h1><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('Showing 1–10 of 50 · Newest first', { exact: true }).waitFor();
    const rows = () => page.locator('[data-activity-id]');
    const next = () => page.getByRole('button', { name: 'Next 10 →', exact: true }).first();
    const previous = () => page.getByRole('button', { name: '← Previous 10', exact: true }).first();
    assert.equal(await previous().isDisabled(), true);
    const seen = [];
    for (let p = 0; p < 5; p++) {
      await page.getByText(`Showing ${p * 10 + 1}–${p * 10 + 10} of 50 · Newest first`, { exact: true }).waitFor();
      assert.equal(await rows().count(), 10);
      seen.push(...await rows().evaluateAll((nodes) => nodes.map((node) => node.dataset.activityId)));
      assert.match(await rows().first().getAttribute('href'), /view=playerFees/);
      if (p === 0) await page.screenshot({ path: path.join(output, 'first-10-desktop.png'), fullPage: true });
      if (p < 4) await next().click();
    }
    assert.equal(new Set(seen).size, 50);
    assert.deepEqual(seen, Array.from({ length: 50 }, (_, i) => `event-${i + 1}`));
    assert.equal(await next().isDisabled(), true);
    await previous().click();
    await page.getByText('Showing 31–40 of 50 · Newest first', { exact: true }).waitFor();

    for (const count of [0, 9, 10, 11, 60]) {
      await page.evaluate((n) => window.showActivity(n), count);
      if (count === 0) {
        await page.getByText('No external activity has been recorded yet.').waitFor();
        assert.equal(await rows().count(), 0);
      } else {
        await page.getByText(`Showing 1–${Math.min(count, 10)} of ${Math.min(count, 50)} · Newest first`, { exact: true }).waitFor();
        assert.equal(await rows().count(), Math.min(count, 10));
        if (count <= 10) assert.equal(await page.getByRole('button').count(), 0);
        if (count === 11) {
          await next().click();
          await page.getByText('Showing 11–11 of 11 · Newest first', { exact: true }).waitFor();
          assert.equal(await rows().count(), 1);
          assert.equal(await next().isDisabled(), true);
        }
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(output, 'first-10-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal overflow');
    assert.deepEqual(errors, []);
    console.log('Activity browser checks passed: five pages, previous/next, all 50 unique rows, empty/partial states, cap and mobile layout.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
