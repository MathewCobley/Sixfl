const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const out = path.resolve('artifacts/pwa-desktop-viewer');
fs.mkdirSync(out, { recursive: true });
const data = {
  captainTeams: ['Alpha', 'Beta'].map(name => ({ id: name.toLowerCase(), name: name + ' Test', leagueLabel: 'Synthetic league', logoUrl: null })),
  playerTeams: [
    { id: 'alpha', name: 'Alpha Test', leagueLabel: 'Synthetic league', logoUrl: null, players: [{ membershipId: 'member-a', name: 'Alex Example', role: 'PLAYER' }] },
    { id: 'beta', name: 'Beta Test', leagueLabel: 'Synthetic league', logoUrl: null, players: [{ membershipId: 'member-b', name: 'Bea Example', role: 'PLAYER' }, { membershipId: 'member-c', name: 'Cara Example', role: 'CAPTAIN' }] },
  ],
  referees: [{ id: 'ref-stefan', name: 'Stefan Example', email: 'stefan@example.invalid' }, { id: 'ref-taylor', name: 'Taylor Example', email: 'taylor@example.invalid' }],
};
const source = `import React from 'react'; import {createRoot} from 'react-dom/client'; import Panel from './src/components/admin/PwaDiagnosticsPanel'; const empty = location.search.includes('empty'); createRoot(document.getElementById('root')).render(<Panel viewerData={empty ? {captainTeams:[],playerTeams:[],referees:[]} : ${JSON.stringify(data)}} />);`;

(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'pwa-preview-test.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'isolated-next-link', setup(build) {
      build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{...props,href},children)}`, loader: 'js', resolveDir: process.cwd() }));
    } }],
  });
  const cssFiles = [];
  function walk(dir) { if (!fs.existsSync(dir)) return; for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, item.name); if (item.isDirectory()) walk(full); else if (full.endsWith('.css')) cssFiles.push(full); } }
  walk('.next/static');
  assert.ok(cssFiles.length, 'use the production-built Tailwind stylesheet');
  const css = cssFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (url.pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    if (url.pathname === '/manifest.webmanifest') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ name: 'SIXFL test', short_name: 'SIXFL', start_url: '/dashboard?app=1', display: 'standalone', scope: '/', icons: [] })); }
    res.setHeader('Content-Type', 'text/html');
    if (url.pathname === '/preview-test') return res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="background:#050b08;color:white;padding:24px"><div id="root"></div><script src="/bundle.js"></script></body></html>');
    // Real component route handoff, synthetic destination: never use a live user or session.
    return res.end('<!doctype html><html><body style="background:#081c13;color:white;font:16px sans-serif;padding:20px">Isolated SIXFL portal destination. No live records.</body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const iframe = page.locator('iframe');
  async function expectPath(expected) { await page.waitForFunction(value => document.querySelector('iframe')?.getAttribute('src') === value, expected); assert.equal(await iframe.getAttribute('src'), expected); }
  try {
    await page.goto(origin + '/preview-test');
    await page.getByRole('heading', { name: 'Who do you want to view the app as?' }).waitFor();
    const firstChooser = await page.getByRole('heading', { name: 'Who do you want to view the app as?' }).boundingBox();
    assert.ok(firstChooser.y < 250, 'PC chooser must appear before technical checks');
    await page.getByRole('button', { name: /Alpha Test/ }).click();
    await page.getByRole('button', { name: /Beta Test/ }).click();
    await page.getByRole('button', { name: 'View in phone preview', exact: true }).click();
    await expectPath('/admin/teams/beta/captain-preview');

    await page.getByRole('button', { name: 'Player Portal', exact: true }).click();
    await page.getByRole('button', { name: /Alpha Test/ }).click();
    await page.getByRole('button', { name: /Beta Test/ }).click();
    await page.getByRole('button', { name: /Bea Example/ }).click();
    await page.getByRole('button', { name: /Cara Example/ }).click();
    await page.getByRole('button', { name: 'View in phone preview', exact: true }).click();
    await expectPath('/player/team/beta?previewMembershipId=member-c&pwaPreview=1');
    await page.reload();
    await page.getByRole('button', { name: /Cara Example/ }).waitFor();
    await expectPath('/player/team/beta?previewMembershipId=member-c&pwaPreview=1');
    assert.match(await page.locator('body').innerText(), /Player Portal · Cara Example · Beta Test/);
    await page.screenshot({ path: path.join(out, 'desktop-restored-picker.png'), fullPage: true });

    await page.getByRole('button', { name: 'Referee Portal', exact: true }).click();
    await page.getByRole('button', { name: /Stefan Example/ }).click();
    await page.getByRole('button', { name: /Taylor Example/ }).click();
    await page.getByRole('button', { name: 'View in phone preview', exact: true }).click();
    const refereePath = '/admin/referees/ref-taylor/referee-preview?to=' + encodeURIComponent('/referee?pwaPreview=1');
    await expectPath(refereePath);
    await page.getByLabel('Any SIXFL route').fill('https://example.invalid/not-sixfl');
    await page.getByRole('button', { name: 'Load route', exact: true }).click();
    await page.getByText('Enter a SIXFL route such as /admin, /dashboard or /captain/team/...', { exact: true }).waitFor();
    await expectPath(refereePath);
    await page.getByRole('button', { name: /iPhone SE/ }).click();
    assert.equal(Math.round((await iframe.boundingBox()).width), 355); // 375px frame minus two 10px borders.

    await page.evaluate(() => { localStorage.setItem('sixfl-admin-pwa-viewer-selection-v1', '{broken'); localStorage.setItem('sixfl-admin-pwa-preview-path-v1', 'https://example.invalid/not-sixfl'); });
    await page.reload();
    await page.getByRole('button', { name: /Alpha Test/ }).waitFor();
    await expectPath('/dashboard?app=1');
    await page.goto(origin + '/preview-test?empty');
    assert.equal(await page.getByRole('button', { name: 'View in phone preview', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Player Portal', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'View in phone preview', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Referee Portal', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'View in phone preview', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: Captain/Player/Referee route handoff, exact player selection, restored state/path, empty data, device sizing and external URL blocking. All destinations and accounts synthetic.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
