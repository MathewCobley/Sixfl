const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require(process.env.CUP_PLAYWRIGHT || 'playwright');
(async () => {
  const source = `
    import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
    import Editor from './src/components/cups/CupResponseEditor';
    window.edits = []; window.failSave = false; window.releaseSave = null;
    function Card() {
      const [saved, setSaved] = useState({ response: 'NO', responseVersion: 3 });
      async function save(_, form) {
        const values = Object.fromEntries(form.entries()); window.edits.push(values);
        await new Promise(resolve => { window.releaseSave = resolve; });
        if (window.failSave) return { error: 'Response changed in another window. Refresh and review it.' };
        setSaved({ response: values.response, responseVersion: Number(values.responseVersion) + 1 });
        return { success: 'Response updated. No email was sent.' };
      }
      return <article id="first" className="space-y-4 rounded-2xl border border-white/15 p-5">
        <h2 className="font-semibold">Example County Football Club</h2><p id="saved-response">{saved.response}</p>
        <Editor cupId="cup" teamId="first-team" invitationId="first-invitation" settingsVersion={2} {...saved} action={save}/>
        {saved.response === 'YES' ? <a href="#entrants">Review / confirm entry</a> : null}
        <details><summary>Email delivery and contact history (1)</summary><p>Original captain response retained in audit.</p><p>Last reminder: 15 September 2026</p></details>
      </article>;
    }
    createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl space-y-6 p-4 text-white"><h1 className="text-2xl font-bold">Cup invitations &amp; responses</h1><Card/><article id="other" className="rounded-2xl border border-white/15 p-5"><h2>Other team</h2><p>Awaiting response</p></article></main>);
  `;
  const js = (await build({ stdin: { contents: source, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
  const css = []; function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (file.endsWith('.css')) css.push(fs.readFileSync(file, 'utf8')); } } walk('.next/static');
  const server = http.createServer((request, response) => { response.setHeader('Content-Type', request.url === '/app.js' ? 'text/javascript' : 'text/html'); response.end(request.url === '/app.js' ? js : `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.join('\n')}body{margin:0;background:#080808}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser; fs.mkdirSync('artifacts/cup-invitations', { recursive: true });
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [390, 1360]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
        await page.goto(origin); const card = page.locator('#first');
        await card.getByLabel('Edit response').waitFor(); assert.deepEqual(await page.evaluate(() => window.edits), []);
        assert.equal(await card.locator('select').count(), 0, 'Use the shared custom selector, not a native select');
        async function choose(label) { await card.getByLabel('Edit response').click(); await page.getByRole('option', { name: label, exact: true }).click(); }
        await choose('Yes — interested'); assert.deepEqual(await page.evaluate(() => window.edits), [], 'Selecting alone cannot save');
        await card.getByRole('button', { name: 'Save response', exact: true }).click();
        await page.waitForFunction(() => typeof window.releaseSave === 'function');
        assert.equal(await card.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), true);
        assert.equal(await card.getByLabel('Edit response').isDisabled(), true);
        assert.deepEqual(await page.evaluate(() => window.edits[0]), { cupId: 'cup', teamId: 'first-team', invitationId: 'first-invitation', responseVersion: '3', settingsVersion: '2', response: 'YES' });
        await page.evaluate(() => window.releaseSave()); await card.getByRole('status').waitFor();
        assert.equal(await card.locator('#saved-response').textContent(), 'YES'); assert.equal(await card.getByRole('link', { name: 'Review / confirm entry' }).count(), 1);
        assert.equal(await card.locator('input[name="responseVersion"]').inputValue(), '4');
        await choose('No — not this time'); await page.evaluate(() => { window.failSave = true; window.releaseSave = null; });
        await card.getByRole('button', { name: 'Save response', exact: true }).click(); await page.waitForFunction(() => typeof window.releaseSave === 'function');
        await page.evaluate(() => window.releaseSave()); await card.getByRole('alert').waitFor();
        assert.equal(await card.locator('#saved-response').textContent(), 'YES', 'Failure cannot show a saved response');
        assert.equal(await card.getByRole('button', { name: 'Save response', exact: true }).isEnabled(), true);
        await choose('Awaiting response'); await page.evaluate(() => { window.failSave = false; window.releaseSave = null; });
        await card.getByRole('button', { name: 'Save response', exact: true }).click(); await page.waitForFunction(() => typeof window.releaseSave === 'function');
        await page.evaluate(() => window.releaseSave()); await card.getByRole('status').waitFor();
        assert.equal(await card.locator('#saved-response').textContent(), 'PENDING');
        assert.equal(await card.getByRole('link', { name: 'Review / confirm entry' }).count(), 0);
        assert.equal(await page.locator('#other').textContent(), 'Other teamAwaiting response');
        await card.locator('summary').click(); assert.equal(await card.getByText('Last reminder: 15 September 2026').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.deepEqual(errors, []);
        await card.screenshot({ path: `artifacts/cup-invitations/admin-response-${width}.png` });
        console.log(`PASS ${width}px actual editor: explicit save, exact snapshot, pending lock, failure retry, new server version, preserved history and separate entry review`);
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
