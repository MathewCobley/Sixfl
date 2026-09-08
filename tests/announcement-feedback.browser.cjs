const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const sourceId = 'synthetic-template:' + 'a'.repeat(32);
  const review = { templateId: 'synthetic-template', sourceId, audienceKey: 'b'.repeat(64) };
  const base = { sourceId, total: 560, recorded: 0, remaining: 560, queued: 0, processing: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, checkedAt: new Date().toISOString() };
  const bundle = await esbuild.build({ stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Panel from './src/components/admin/communications/AnnouncementSendPanel'; createRoot(document.getElementById('root')).render(<Panel review={window.review} initialProgress={window.initial} compatible={true}/>);`,
    loader: 'tsx', resolveDir: process.cwd(),
  }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: path.resolve('tsconfig.json'), define: { 'process.env': '{}' } });
  let initial = base;
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].text); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body><div id="root"></div><script>window.review=' + JSON.stringify(review) + ';window.initial=' + JSON.stringify(initial) + '</script><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  let posts = 0, gets = 0, mode = 'hold', status = base, held = null;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request();
      if (!req.url().startsWith(origin)) { await route.abort(); return; }
      if (!new URL(req.url()).pathname.startsWith('/api/admin/announcements')) { await route.continue(); return; }
      if (req.method() === 'GET') {
        gets += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, progress: { ...status, checkedAt: new Date().toISOString() }, reviewChanged: mode === 'changed' }) });
        return;
      }
      posts += 1;
      const data = req.postDataJSON();
      assert.equal(data.sourceId, sourceId); assert.equal(data.audienceKey, review.audienceKey); assert.equal(data.confirmed, true);
      assert.equal(req.headers()['x-sixfl-announcement'], '1');
      if (mode === 'abort') { await route.abort(); return; }
      if (mode === 'changed') { await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'The template or contact list has changed.' }) }); return; }
      held = route;
    });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Check progress', exact: true }).waitFor();
    await page.waitForTimeout(100);
    assert.equal(posts, 0);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /^Queue announcement/ }).click();
    const pending = page.getByRole('button', { name: 'Queueing announcement…', exact: true });
    await pending.waitFor();
    assert.equal(await pending.isDisabled(), true);
    await page.locator('form').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await page.waitForTimeout(150);
    assert.equal(posts, 1);
    status = { ...base, recorded: 200, remaining: 360, queued: 175, sent: 25 };
    await page.getByRole('button', { name: 'Check progress', exact: true }).click();
    await page.getByText('200 of 560 addresses recorded · 360 not yet recorded.', { exact: true }).waitFor();
    assert.equal(posts, 1);
    status = { ...base, recorded: 560, remaining: 0, queued: 530, sent: 25, skipped: 5, checkedAt: new Date().toISOString() };
    await held.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, progress: status, queueFailures: 0 }) }); held = null;
    await page.getByText(/Queueing is complete\. You can leave this page/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'No new emails to queue', exact: true }).isDisabled(), true);
    assert.match(await page.getByRole('link', { name: 'View this announcement in Queue' }).getAttribute('href'), /q=synthetic-template%3A/);
    // A read-only refresh observes delivery progress, without another POST.
    status = { ...status, queued: 0, sent: 555 };
    await page.getByRole('button', { name: 'Check progress', exact: true }).click();
    await page.getByText('555', { exact: true }).waitFor();
    assert.equal(posts, 1);
    // Reloading an already-recorded mailing cannot resend it.
    initial = status;
    await page.reload();
    assert.equal(await page.getByRole('button', { name: 'No new emails to queue', exact: true }).isDisabled(), true);
    assert.equal(posts, 1);
    // Lost response: no automatic write retry. User must perform a read-only check.
    initial = base; status = base; mode = 'abort';
    await page.goto(origin + '/lost');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /^Queue announcement/ }).click();
    await page.getByText('Queueing outcome needs checking', { exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox').isDisabled(), true);
    const afterAbort = posts;
    await page.waitForTimeout(5500);
    assert.equal(posts, afterAbort);
    status = { ...base, recorded: 500, remaining: 60, queued: 500 };
    await page.getByRole('button', { name: 'Check progress', exact: true }).click();
    await page.getByText('500 of 560 addresses recorded · 60 not yet recorded.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox').isChecked(), false);
    assert.equal(await page.getByRole('button', { name: /^Queue announcement to 60/ }).isDisabled(), true);
    // A changed review must never silently send the new content/audience.
    mode = 'changed';
    await page.getByRole('button', { name: 'Check progress', exact: true }).click();
    await page.getByText(/Reload this page and review the latest version/).waitFor();
    assert.equal(await page.getByRole('checkbox').isDisabled(), true);
    assert.equal(posts, afterAbort);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Check progress', exact: true }).scrollIntoViewIfNeeded();
    assert.ok(gets >= 5); assert.deepEqual(errors, []);
    console.log('Real announcement UI passed: immediate pending feedback, double-submit protection, separate queue/delivery progress, read-only check, reload/no-resend, lost response, stale review and mobile controls. No customer messages sent.');
  } finally {
    if (held) await held.abort().catch(() => {});
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
