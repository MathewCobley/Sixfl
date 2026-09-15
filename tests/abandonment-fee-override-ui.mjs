import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Render the actual production-prepared form and its native client controls.
// Only server actions/data are replaced. No real match, provider or login is used.
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Form from './src/components/referee/AbandonedMatchForm';
window.__submissions = [];
const params = new URLSearchParams(location.search);
const admin = params.get('role') !== 'referee';
const saved = params.has('saved') ? {
  reason: 'VIOLENT_OR_THREATENING_CONDUCT', responsibleTeamId: 'team-b', innocentTeamId: 'team-a',
  feeDecision: 'UNCHANGED', feeOverrideReason: 'Internal test decision: only two minutes remained.', details: null
} : null;
createRoot(document.getElementById('root')).render(<Form
  refereeNightId="test-night" fixtureId="test-fixture"
  homeTeam={{ id: 'team-a', name: 'Team A' }} awayTeam={{ id: 'team-b', name: 'Team B' }}
  abandonment={saved} locked={false} canDecideResult={admin} officialResult={null}
/>);
`;
const bundle = await build({
  stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'isolated-abandonment-server', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/fixtures\/abandonment$/ }, () => ({ path: 'data', namespace: 'isolated' }));
    builder.onResolve({ filter: /\/referee\/abandonment(?:-email|-conduct)?-actions$/ }, () => ({ path: 'actions', namespace: 'isolated' }));
    builder.onLoad({ filter: /.*/, namespace: 'isolated' }, args => ({ loader: 'js', contents: args.path === 'data'
      ? `export const FIXTURE_ABANDONMENT_REASONS = [{ value: 'VIOLENT_OR_THREATENING_CONDUCT', label: 'Violent, threatening or aggressive conduct' }]; export const getFixtureAbandonmentReasonLabel = () => 'Violent, threatening or aggressive conduct';`
      : `const capture = async form => { window.__submissions.push(Object.fromEntries(form.entries())); }; export const recordNightFixtureAbandonmentAction = capture; export const resendNightFixtureAbandonmentEmailsAction = capture; export const sendNightFixtureFormalConductNoticeAction = capture;`
    }));
  }}],
});
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    async function open(role = 'admin') {
      await page.goto(`${origin}/?role=${role}`);
      await page.locator('summary').click();
      await page.locator('select[name="reason"]').selectOption('VIOLENT_OR_THREATENING_CONDUCT');
      await page.locator('select[name="responsibleTeamId"]').selectOption('team-b');
    }
    const confirmation = page.locator('input[name="confirmAbandonment"]');
    const submit = page.getByRole('button', { name: 'Record fixture outcome', exact: true });

    await open();
    assert.equal(await page.locator('input[value="STANDARD"]').isChecked(), true);
    await page.getByRole('radio', { name: /Leave both teams/ }).check();
    assert.equal(await confirmation.count(), 1);
    assert.equal(await page.locator('textarea[name="feeOverrideReason"]').getAttribute('required'), '');
    await confirmation.check();
    await submit.click();
    assert.equal(await page.evaluate(() => window.__submissions.length), 0, 'Blank override reason must block submission');
    await page.locator('textarea[name="feeOverrideReason"]').fill('Only two minutes remained.');
    await confirmation.uncheck();
    await submit.click();
    assert.equal(await page.evaluate(() => window.__submissions.length), 0, 'Explicit confirmation is required');
    await confirmation.check();
    await submit.click();
    await page.waitForFunction(() => window.__submissions.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__submissions[0]), {
      refereeNightId: 'test-night', fixtureId: 'test-fixture', reason: 'VIOLENT_OR_THREATENING_CONDUCT',
      responsibleTeamId: 'team-b', resultDecision: 'PENDING', details: '', feeDecision: 'UNCHANGED',
      feeOverrideReason: 'Only two minutes remained.', confirmAbandonment: 'yes',
    });
    console.log(`PASS ${width}px: actual override form submits one explicit unchanged-fee decision with the right fixture, team and reason.`);

    await open();
    await page.getByRole('radio', { name: /Leave both teams/ }).check();
    await page.locator('textarea[name="feeOverrideReason"]').fill('Discard this draft.');
    await page.getByRole('radio', { name: /Apply the normal fee rule/ }).check();
    assert.equal(await page.locator('textarea[name="feeOverrideReason"]').count(), 0);
    assert.equal(await confirmation.count(), 1);
    await confirmation.check(); await submit.click();
    await page.waitForFunction(() => window.__submissions.length === 1);
    const normal = await page.evaluate(() => window.__submissions[0]);
    assert.equal(normal.feeDecision, 'STANDARD'); assert.equal(normal.feeOverrideReason, undefined);
    console.log(`PASS ${width}px: returning to the normal rule removes the override field and restores the original confirmation.`);

    await open('referee');
    assert.equal(await page.locator('[name="feeDecision"]').count(), 0);
    assert.equal(await page.locator('[name="feeOverrideReason"]').count(), 0);
    await confirmation.check(); await submit.click();
    await page.waitForFunction(() => window.__submissions.length === 1);
    assert.equal((await page.evaluate(() => window.__submissions[0])).feeDecision, undefined);
    console.log(`PASS ${width}px: ordinary referees retain the standard flow without an override control.`);

    await page.goto(`${origin}/?role=admin&saved=1`);
    await page.getByText('Match fees left unchanged — SIXFL admin override.', { exact: true }).waitFor();
    assert.equal(await page.getByText(/Team B is still recorded as responsible/).count(), 1);
    assert.equal(await page.getByText(/Admin reason: Internal test decision/).count(), 1);
    assert.equal(await page.getByText(/Their charge is both teams/).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Send abandonment emails again', exact: true }).count(), 1);
    await page.goto(`${origin}/?role=referee&saved=1`);
    await page.getByText('Match fees left unchanged — SIXFL admin override.', { exact: true }).waitFor();
    assert.equal(await page.getByText(/Internal test decision/).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Send abandonment emails again', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: saved decision is accurate, admin reasoning stays private and permission boundaries remain intact.`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
