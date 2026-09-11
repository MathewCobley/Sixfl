const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Controls from './src/components/admin/leads/TeamLeadDecisionControls';
      const state = new URL(location.href).searchParams;
      createRoot(document.getElementById('root')).render(<Controls leadId="isolated-lead" leadName="Example enquiry" declined={state.has('declined')} converted={state.has('converted')} declinedAt="2026-09-08T09:00:00Z"/>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: path.resolve('tsconfig.json'),
    plugins: [{ name: 'isolated-navigation', setup(build) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'isolated' }));
      build.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const useRouter = () => ({refresh() { window.__REFRESH_COUNT__ = (window.__REFRESH_COUNT__ || 0) + 1; }});', loader: 'js' }));
    } }],
  });
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].text); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], requests = [];
    let reject = false, release;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      if (!request.url().startsWith(origin)) { await route.abort(); return; }
      if (new URL(request.url()).pathname !== '/api/admin/leads/isolated-lead/decision') { await route.continue(); return; }
      requests.push({ method: request.method(), header: request.headers()['x-sixfl-lead-decision'], payload: request.postDataJSON() });
      if (reject) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Administrator access is required.' }) });
        return;
      }
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, declinedAt: '2026-09-08T09:00:00Z', cancelledCount: 2, processingCount: 1 }) });
    });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Not interested — stop chasing', exact: true }).click();
    await page.getByText('Record a no from Example enquiry?').waitFor();
    assert.equal(requests.length, 0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(requests.length, 0);
    await page.getByRole('button', { name: 'Not interested — stop chasing', exact: true }).click();
    await page.getByLabel('How did they tell you?').selectOption('PHONE');
    await page.getByLabel('Reason / note (optional)').fill('They no longer want to enter.');
    await page.getByRole('button', { name: 'Confirm — stop chasing', exact: true }).click();
    await page.getByRole('button', { name: 'Saving…', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), true);
    await page.locator('form').evaluate(form => { form.requestSubmit(); });
    await page.waitForTimeout(100);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], { method: 'POST', header: '1', payload: { decision: 'DECLINED', via: 'PHONE', note: 'They no longer want to enter.' } });
    release();
    await page.getByText('Not interested — chases stopped', { exact: true }).waitFor();
    await page.getByText('2 unsent follow-ups cancelled.', { exact: false }).waitFor();
    await page.getByText('anything already submitted cannot be recalled.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.__REFRESH_COUNT__), 1);
    assert.equal(await page.getByRole('button').count(), 0);
    await page.goto(origin + '/?declined=1');
    await page.getByText('Not interested — chases stopped', { exact: true }).waitFor();
    assert.equal(requests.length, 1);
    await page.goto(origin + '/?converted=1');
    assert.equal(await page.getByRole('button').count(), 0);
    reject = true;
    await page.goto(origin);
    await page.getByRole('button', { name: 'Not interested — stop chasing', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm — stop chasing', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Administrator access is required.' }).waitFor();
    assert.equal(await page.getByText('Not interested — chases stopped', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Native decline control passed: read-only open/cancel, explicit decision, channel/note, busy duplicate prevention, persisted stopped display, processing caveat, conversion guard and honest error. No customer messages or live API requests.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
