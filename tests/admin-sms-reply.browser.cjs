const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium } = require('playwright');
(async () => {
  const bundle = await esbuild.build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Form from './src/components/admin/messages/AdminSmsReplyForm'; const root=createRoot(document.getElementById('root')); window.show=(thread='thread-one',actor='admin-one')=>root.render(<Form key={actor+thread} actorId={actor} threadId={thread} phone='+447700900111' canReply={true}/>); window.show();`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', tsconfig: path.resolve('tsconfig.json'), define: { 'process.env': '{}' }, plugins: [{ name: 'isolated-router', setup(build) { build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'stub' })); build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){window.refreshCount=(window.refreshCount||0)+1}}}' })); } }] });
  const server = http.createServer((req, res) => { if (req.url === '/app.js') { res.setHeader('content-type', 'application/javascript'); res.end(bundle.outputFiles[0].text); } else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let held = null;
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      let mode = 'hold', posts = [], gets = 0, stored = null;
      const endpoint = '/api/admin/messages/sms-reply';
      function record(data) { return { messageId: 'saved-' + data.requestId, dispatchId: 'dispatch-one', status: 'QUEUED', providerStatus: 'queued', failureReason: null, scheduledFor: '2026-09-10T08:00:00.000Z', sentAt: null, body: data.body + '\n\nSIXFL', toNumber: data.expectedPhone }; }
      await page.route('**/*', async route => {
        const req = route.request();
        if (!req.url().startsWith(origin)) return route.abort();
        if (new URL(req.url()).pathname !== endpoint) return route.continue();
        if (req.method() === 'GET') { gets++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(new URL(req.url()).searchParams.get('recent')==='1' ? {ok:true,records:stored?[stored]:[]} : { ok: true, record: stored }) }); }
        assert.equal(req.method(), 'POST'); const data = req.postDataJSON(); posts.push(data);
        assert.equal(req.headers()['x-sixfl-sms-reply'], '1'); assert.equal(data.threadId, 'thread-one'); assert.equal(data.expectedPhone, '+447700900111');
        if (mode === 'hold') { held = route; return; }
        if (mode === 'lost') { stored = record(data); return route.abort(); }
        if (mode === 'lost-before-save') { stored = null; return route.abort(); }
        if (mode === 'reject') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, uncertain: false, error: 'The contact number has changed. Refresh the conversation.' }) });
        stored = record(data); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, record: stored }) });
      });
      await page.goto(origin);
      const field = page.getByRole('textbox', { name: 'SMS reply' });
      await field.fill('First synthetic reply');
      await page.getByRole('button', { name: 'Send SMS reply', exact: true }).click();
      const pending = page.getByRole('button', { name: 'Queueing reply…', exact: true }); await pending.waitFor(); assert.equal(await pending.isDisabled(), true);
      assert.equal(await field.inputValue(), 'First synthetic reply');
      await page.locator('form').evaluate(form => { for (let i=0;i<2;i++) form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); });
      await page.waitForTimeout(100); assert.equal(posts.length, 1);
      stored = record(posts[0]); await held.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, record: stored }) }); held = null;
      await page.getByText('Reply saved and queued. You can leave this page; it has not been sent yet.', { exact: true }).waitFor(); assert.equal(await field.inputValue(), '');
      await page.getByText('Queued — not sent yet', { exact: true }).waitFor(); assert.match(await page.getByRole('link', { name: 'View this reply in Queue' }).getAttribute('href'), /dispatch-one/);
      // Regression: the former form discarded its only receipt/reference on a
      // reload or conversation switch even though the server had saved it.
      await page.reload(); await page.getByText('Your last saved reply has been restored. Check status for its latest progress; it has not been resent.', {exact:true}).waitFor();
      assert.equal(await field.inputValue(),''); assert.equal(posts.length,1);
      await page.getByRole('link',{name:'View this reply in Queue',exact:true}).waitFor();
      await page.evaluate(()=>window.show('thread-two')); await page.waitForTimeout(80);
      assert.equal(await page.getByRole('link',{name:'View this reply in Queue',exact:true}).count(),0);
      await page.evaluate(()=>window.show('thread-one','admin-two')); await page.waitForTimeout(80);
      assert.equal(await page.getByRole('link',{name:'View this reply in Queue',exact:true}).count(),0);
      await page.evaluate(()=>window.show()); await page.getByRole('link',{name:'View this reply in Queue',exact:true}).waitFor();
      assert.equal(posts.length,1);
      // Refresh reads genuine dispatch state, does not send again.
      stored = { ...stored, status: 'SENT', providerStatus: 'sent' }; await page.getByRole('button', { name: 'Check status', exact: true }).click(); await page.getByText('Sent to SMS provider', { exact: true }).waitFor(); assert.equal(posts.length, 1);
      mode = 'reject'; await field.fill('Keep me on validation failure'); await page.getByRole('button', { name: 'Send SMS reply', exact: true }).click(); await page.getByText('The contact number has changed. Refresh the conversation.', { exact: true }).waitFor(); assert.equal(await field.inputValue(), 'Keep me on validation failure');
      await page.reload(); await field.waitFor(); assert.equal(await field.inputValue(), 'Keep me on validation failure');
      // Separate threads and administrators never receive this draft.
      await page.evaluate(() => window.show('thread-two')); await page.waitForTimeout(80); assert.equal(await field.inputValue(), '');
      await page.evaluate(() => window.show('thread-one', 'admin-two')); await page.waitForTimeout(80); assert.equal(await field.inputValue(), '');
      await page.evaluate(() => window.show()); await page.waitForTimeout(80); assert.equal(await field.inputValue(), 'Keep me on validation failure');
      // Lost response AFTER save: reload keeps the request identity; GET recovers.
      mode = 'lost'; await field.fill('Lost acknowledgement'); await page.getByRole('button', { name: 'Send SMS reply', exact: true }).click(); await page.getByText(/connection ended without a confirmed result/).waitFor(); assert.equal(await field.inputValue(), 'Lost acknowledgement');
      const countAtLoss = posts.length; await page.reload(); await page.getByText(/previous send attempt needs checking/).waitFor(); assert.equal(posts.length, countAtLoss);
      assert.equal(await page.getByRole('button', { name: 'Retry this reply safely' }).isDisabled(), true);
      await page.getByRole('button', { name: 'Check status', exact: true }).click(); await page.getByText(/Reply saved and queued/).waitFor(); assert.equal(await field.inputValue(), ''); assert.equal(posts.length, countAtLoss);
      // Lost BEFORE save: deliberate retry retains same key, never auto-resends.
      mode = 'lost-before-save'; await field.fill('Safe explicit retry'); await page.getByRole('button', { name: 'Send SMS reply', exact: true }).click(); await page.getByText(/connection ended without a confirmed result/).waitFor();
      const retryKey = posts.at(-1).requestId; const beforeCheck = posts.length;
      await page.getByRole('button', { name: 'Check status', exact: true }).click(); await page.getByText(/No saved reply was found/).waitFor(); assert.equal(posts.length, beforeCheck);
      mode = 'save'; await page.getByRole('button', { name: 'Retry this reply safely' }).click(); await page.getByText(/Reply saved and queued/).waitFor(); assert.equal(posts.at(-1).requestId, retryKey);
      stored = { ...stored, status: 'FAILED', providerStatus: 'failed', failureReason: 'Synthetic provider failure' };
      await page.getByRole('button', { name: 'Check status', exact: true }).click(); await page.getByText('Failed', { exact: true }).waitFor(); assert.equal(posts.length, beforeCheck + 1);
      const beforeNewDraft = posts.length; await page.getByRole("button", { name: "Write another reply" }).click(); await page.getByText("New empty draft opened. The previous reply has not been retried.", { exact: true }).waitFor(); assert.equal(await field.inputValue(), ""); assert.equal(await field.getAttribute("readonly"), null); assert.equal(posts.length, beforeNewDraft);
      // Lost tab storage/reference: a bounded server lookup still finds recorded
      // replies. It must not mutate the next draft or issue another POST.
      await field.fill('Next draft must be kept');
      await page.getByRole('button',{name:'Find recent SMS replies',exact:true}).click();
      await page.getByRole('link',{name:'View recorded reply in Queue',exact:true}).waitFor();
      assert.equal(await field.inputValue(),'Next draft must be kept'); assert.equal(posts.length,beforeNewDraft);
      stored=null; await page.getByRole('button',{name:'Find recent SMS replies',exact:true}).click();
      await page.getByText(/No recorded administrator SMS replies were found/).waitFor();
      assert.equal(posts.length,beforeNewDraft); assert.equal(await field.inputValue(),'Next draft must be kept');
      assert.ok(gets >= 6); assert.deepEqual(errors, []);
      console.log('Browser passed '+viewport.width+'px: explicit POST, pending/double click, queued-not-sent, draft reload/isolation, failed validation, lost-response recovery, stable retry key, read-only status and provider failure.');
      await page.close();
    }
  } finally { if (held) await held.abort().catch(() => {}); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
