const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  // Real editor, preview and save-request hook. Only the save HTTP boundary is isolated.
  const bundle = await esbuild.build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Form from './src/components/admin/email-templates/EmailTemplateForm';
      const saved = window.__SAVED__;
      const system = saved ? saved.templateType === 'system' : new URL(location.href).searchParams.get('type') === 'system';
      createRoot(document.getElementById('root')).render(<Form mode={saved ? 'edit' : 'create'} templateType={system ? 'system' : 'campaign'} initialValues={saved || {name:'Isolated referral template',key:'isolated-referral',audience:'GENERAL',subject:'Referral test'}}/>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env': '{}' },
    tsconfig: path.resolve('tsconfig.json'),
  });
  let saved = null;
  const saves = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].text); return; }
    res.setHeader('Content-Type', 'text/html');
    const edit = req.url.startsWith('/admin/templates/isolated-template');
    res.end('<!doctype html><html><body><div id="root"></div><script>window.__SAVED__=' + JSON.stringify(edit ? saved : null).replaceAll('<', '\\u003c') + '</script><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  try {
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request();
      if (!req.url().startsWith(origin)) { await route.abort(); return; }
      if (new URL(req.url()).pathname !== '/api/admin/templates/save') { await route.continue(); return; }
      const form = await new Request(req.url(), { method: 'POST', headers: { 'content-type': req.headers()['content-type'] }, body: req.postDataBuffer() }).formData();
      const values = Object.fromEntries(form.entries());
      saves.push(values);
      saved = { ...values, id: 'isolated-template', isActive: values.isActive === 'true' };
      // Match the real API's safe URL shape for BOTH campaign and system emails.
      // Template type is loaded from the saved record, not an unsupported redirect query.
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'Template saved successfully.', redirectTo: '/admin/templates/isolated-template?created=1' }) });
    });
    for (const type of ['campaign', 'system']) {
      console.log('Testing ' + type + ' editor');
      saved = null;
      await page.goto(origin + '/?type=' + type);
      const body = page.locator('textarea[name="body"]');
      await body.fill('Before selected after');
      await body.evaluate(el => { el.focus(); el.setSelectionRange(7, 15); });
      await page.getByRole('button', { name: 'Italics', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('textarea[name="body"]').value === 'Before *selected* after');
      await page.locator('iframe').scrollIntoViewIfNeeded();
      await page.frameLocator('iframe').locator('em').filter({ hasText: 'selected' }).waitFor();
      await page.getByRole('button', { name: 'Italics', exact: true }).click();
      assert.equal(await body.inputValue(), 'Before selected after');
      await body.evaluate(el => { el.focus(); el.setSelectionRange(7, 15); });
      await page.keyboard.press('Control+i');
      assert.equal(await body.inputValue(), 'Before *selected* after');
      await body.fill('Read the terms: https://example.test/terms');
      await body.evaluate(el => { el.focus(); el.select(); });
      await page.getByRole('button', { name: 'Italics', exact: true }).click();
      await page.locator('iframe').scrollIntoViewIfNeeded();
      await page.frameLocator('iframe').locator('em').filter({ hasText: 'Read the terms: https://example.test/terms' }).waitFor();
      await body.fill('Bold and italic');
      await body.evaluate(el => { el.focus(); el.select(); });
      await page.getByRole('button', { name: 'Bold', exact: true }).click();
      // The editor restores its caret in requestAnimationFrame. Let that owned
      // update finish before programmatically making a new selection, or its
      // pending callback can overwrite the test's el.select(). Keep all original
      // formatting, rendered-preview and save/reopen assertions unchanged.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForFunction(() => {
        const el = document.querySelector('textarea[name="body"]');
        return el.value === '**Bold and italic**' && el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
      });
      await body.evaluate(el => { el.focus(); el.select(); });
      await page.getByRole('button', { name: 'Italics', exact: true }).click();
      assert.equal(await body.inputValue(), '***Bold and italic***');
      await page.locator('iframe').scrollIntoViewIfNeeded();
      await page.frameLocator('iframe').locator('strong em').filter({ hasText: 'Bold and italic' }).waitFor();
      await page.getByRole('button', { name: /^Referral page/ }).click();
      await page.locator('input[name="ctaLabel"]').fill('Get my referral link');
      assert.equal(await page.locator('input[name="ctaUrlKey"]').inputValue(), 'referralPageUrl');
      await page.locator('iframe').scrollIntoViewIfNeeded();
      const link = page.frameLocator('iframe').getByRole('link', { name: 'Get my referral link', exact: true });
      await link.waitFor();
      assert.equal(await link.getAttribute('href'), 'https://www.sixfl.co.uk/player/referrals');
      await page.getByRole('button', { name: 'Create template', exact: true }).click();
      await page.waitForURL('**/admin/templates/isolated-template?created=1');
      await page.locator('input[name="ctaUrlKey"]').waitFor({ state: 'attached' });
      assert.equal(await page.locator('input[name="ctaUrlKey"]').inputValue(), 'referralPageUrl');
      assert.equal(await page.locator('input[name="ctaLabel"]').inputValue(), 'Get my referral link');
      assert.equal(await page.locator('textarea[name="body"]').inputValue(), '***Bold and italic***');
      assert.equal(saves.at(-1).templateType, type);
      assert.equal(saves.at(-1).ctaUrlKey, 'referralPageUrl');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/?type=campaign');
    const body = page.locator('textarea[name="body"]');
    await body.fill('');
    await page.getByRole('button', { name: 'Italics', exact: true }).click();
    assert.equal(await body.inputValue(), '*italic text*');
    await body.fill('- First\n  - Second');
    await body.evaluate(el => { el.focus(); el.select(); });
    await page.getByRole('button', { name: 'Italics', exact: true }).click();
    assert.equal(await body.inputValue(), '- *First*\n  - *Second*');
    assert.deepEqual(errors, []);
    console.log('Real editor browser checks passed: campaign/system selection, toolbar, Ctrl+I, nested emphasis, referral preview, save/reopen, mobile and caret. No emails were sent.');
  } catch (error) {
    console.error('Synthetic editor diagnostics:', { url: page.url(), saveCount: saves.length, pageErrors: errors });
    console.error(await page.locator('[role="alert"], [role="status"]').allTextContents());
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
