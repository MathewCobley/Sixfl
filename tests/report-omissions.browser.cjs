const { test, before, after } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require(process.env.REPORT_PLAYWRIGHT_MODULE || 'playwright');
let browser, server, origin;
before(async () => {
  const view = JSON.parse(fs.readFileSync('.tmp/report-omissions/view.json', 'utf8'));
  const savedView = JSON.parse(fs.readFileSync('.tmp/report-omissions/saved-view.json', 'utf8'));
  const replacements = JSON.parse(fs.readFileSync('.tmp/report-omissions/replacement-views.json', 'utf8'));
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';import Editor from './src/components/admin/matchweek-reports/ReportEditor';
    const root=createRoot(document.getElementById('root'));window.base=${JSON.stringify(view)};window.saved=${JSON.stringify(savedView)};window.nextView=window.base;window.replacements=${JSON.stringify(replacements)};window.calls=[];
    window.fetch=async(url,opts={})=>{if(url.includes('publication=1'))return new Response(JSON.stringify({ok:true,publication:{status:'DRAFT',revision:0,sourceVersion:null,publishedAt:null,settings:{coverUrl:'',coverAlt:'',coverCaption:''},url:'/leagues/example/news/2026-09-08'}}));window.calls.push({url,method:opts.method||'GET'});if(opts.method==='POST')throw Error('No generation or save allowed in this test');return new Response(JSON.stringify({ok:true,view:window.nextView}),{headers:{'content-type':'application/json'}})};
    let key=0;window.show=(view)=>root.render(<Editor key={++key} slug='example' initialView={view}/>);window.show(window.base);`;
  const bundle = (await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'test-router', setup(b) { b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'mock' })); b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const useRouter=()=>({push(url){window.lastRoute=url}})' })); } }] })).outputFiles[0].text;
  const files = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]);
  const css = files('.next/static').filter(f => f.endsWith('.css')).map(f => fs.readFileSync(f, 'utf8')).join('\n'); assert.ok(css.length);
  server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); }
    else if (req.url === '/app.css') { res.setHeader('content-type', 'text/css'); res.end(css); }
    else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="background:#06120d;color:white"><main id="root" style="padding:16px;max-width:1200px;margin:auto"></main><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + server.address().port; browser = await chromium.launch();
});
after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); });
for (const width of [1440, 390]) test(`current omitted matches are visible and refresh without generation at ${width}px`, async () => {
  const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith(origin) ? r.continue() : r.abort());
  try {
    await page.goto(origin);
    const panel = page.getByRole('region', { name: 'Matches not included (2)' }); await panel.waitFor();
    assert.equal(await panel.getByText('Example City', { exact: false }).first().isVisible(), true);
    assert.equal(await panel.getByText(/marked postponed/).isVisible(), true);
    assert.equal(await panel.getByText(/marked cancelled/).isVisible(), true);
    assert.equal(await page.evaluate(() => window.calls.length), 0);
    const link = panel.getByRole('link', { name: /Review Example City/ });
    assert.equal(await link.getAttribute('href'), '/admin/fixtures/replacement/edit'); assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path: `.tmp/report-omissions/omissions-${width}.png`, fullPage: true });
    // An older saved draft must not replace the CURRENT review list.
    await page.evaluate(() => window.show(window.saved)); await page.getByRole('heading', { name: 'Saved article' }).waitFor();
    assert.equal(await panel.getByText(/marked postponed/).isVisible(), true);
    assert.equal(await page.getByText('STALE OMITTED LABEL', { exact: false }).count(), 0);
    await page.evaluate(() => { window.nextView = structuredClone(window.saved); window.nextView.source.skippedFixtures = [window.nextView.source.skippedFixtures[0]]; window.nextView.source.omittedFixtures = 1; });
    await page.getByRole('button', { name: 'Check saved status', exact: true }).click();
    await page.getByRole('region', { name: 'Matches not included (1)' }).waitFor();
    assert.equal(await page.getByText(/marked postponed/).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Saved article' }).isVisible(), true);
    await page.evaluate(() => { window.nextView = structuredClone(window.saved); window.nextView.source.skippedFixtures = []; window.nextView.source.omittedFixtures = 0; });
    await page.getByRole('button', { name: 'Check saved status', exact: true }).click();
    await page.getByRole('region', { name: /Matches not included/ }).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.calls.length), 2); assert.ok((await page.evaluate(() => window.calls)).every(c => c.method === 'GET'));
    await page.getByLabel('Match night', { exact: true }).fill('2026-09-09'); await page.getByRole('button', { name: 'Load night', exact: true }).click();
    assert.equal(await page.evaluate(() => window.lastRoute), '/admin/matchweek-reports/example?date=2026-09-09');
    // Refresh an actual four-to-six source transition without a paid generation
    // or overwriting the saved four-match article.
    await page.evaluate(() => { window.show(window.replacements.before); window.nextView = window.replacements.after; });
    await page.getByRole('region', { name: 'Matches not included (2)' }).waitFor();
    await page.getByRole('button', { name: 'Check saved status', exact: true }).click();
    await page.getByRole('region', { name: /Matches not included/ }).waitFor({ state: 'detached' });
    await page.getByText(/6 included results/).waitFor();
    await page.getByRole('heading', { name: 'Previously saved four-match draft' }).waitFor();
    assert.equal(await page.getByText('Keep my original text.', { exact: true }).isVisible(), true);
    await page.getByText(/recorded results have changed since this draft/).waitFor();
    await page.getByText('Current source facts (6 results)', { exact: true }).click();
    assert.equal(await page.getByText(/Example early opponent 1–2 Example Stand-ins/).isVisible(), true);
    assert.equal(await page.getByText(/Example late opponent 2–3 Example Stand-ins/).isVisible(), true);
    assert.ok((await page.evaluate(() => window.calls)).every(c => c.method === 'GET'));
    await page.screenshot({ path: `.tmp/report-omissions/replacements-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
