const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.SEASON_BROWSER_TOOLS + '/node_modules/playwright');
const esbuild = require(process.env.SEASON_BROWSER_TOOLS + '/node_modules/esbuild');
const summary = {
  competition: { id: 'c', name: 'Test league', currentLeagueId: 'old' },
  seasons: [
    { id: 'old', name: 'Test league', season: 'Summer 2026', isActive: true, publicAt: '2026-01-01', isCurrent: true, teamCount: 2, fixtureCount: 12, completedFixtureCount: 12 },
    { id: 'new', name: 'Test league', season: 'Winter 2026', isActive: true, publicAt: null, isCurrent: false, teamCount: 2, fixtureCount: 0, completedFixtureCount: 0 },
  ],
};
(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Panel from './src/components/admin/leagues/AdminLeagueSeasonsPanel.tsx'; createRoot(document.getElementById('root')).render(<Panel leagueId="new"/>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'isolated-next-navigation', setup(build) {
      build.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'test-next' }));
      build.onLoad({ filter: /.*/, namespace: 'test-next' }, args => ({ loader: 'js', resolveDir: process.cwd(), contents: args.path === 'next/link'
        ? `import React from 'react'; export default function Link(props){return React.createElement('a',props,props.children);}`
        : `export const usePathname=()=>'/admin/leagues/new'; export const useRouter=()=>({push:path=>{window.testNavigation=path},refresh:()=>{window.testRefreshes=(window.testRefreshes||0)+1}});` }));
    } }],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const requests = []; let accept = false; let succeed = false; let dialogText = ''; let data = structuredClone(summary);
    page.on('dialog', async dialog => { dialogText = dialog.message(); accept ? await dialog.accept() : await dialog.dismiss(); });
    await page.route('**/*', async route => {
      if (route.request().url().includes('/api/admin/leagues/')) {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON(); requests.push(body);
          if (succeed && body.action === 'makeCurrent') {
            data.competition.currentLeagueId = 'new'; data.seasons.forEach(season => { season.isCurrent = season.id === 'new'; });
          }
          await route.fulfill({ status: succeed ? 200 : 409, contentType: 'application/json', body: JSON.stringify(succeed ? { ok: true, leagueId: body.action === 'createSeason' ? 'created' : 'new' } : { error: 'Current season changed. Refresh and review.' }) });
        } else await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      } else await route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' });
    });
    async function mount(next) {
      data = structuredClone(next);
      await page.goto('https://season-ui.invalid/admin/leagues/new');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByRole('button', { name: 'Create private season', exact: true }).waitFor();
    }
    await mount(summary);
    assert.equal(await page.getByRole('button', { name: 'Make current season', exact: true }).isDisabled(), true);
    assert.ok((await page.locator('body').innerText()).includes('Private draft'));
    await page.getByRole('button', { name: 'Create private season', exact: true }).click();
    assert.equal(requests.length, 0, 'missing name must not create anything');
    await page.getByPlaceholder('Winter 2026/27').fill('Spring 2027');
    await page.getByRole('checkbox').uncheck();
    await page.getByRole('button', { name: 'Create private season', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.deepEqual(requests.pop(), { action: 'createSeason', seasonName: 'Spring 2027', copyTeams: false });
    assert.equal(await page.getByRole('button', { name: 'Create private season', exact: true }).isEnabled(), true);
    const publicSummary = structuredClone(summary); publicSummary.seasons[1].publicAt = '2026-01-01';
    // Saved settings can be picked up without reloading the whole page.
    data = structuredClone(publicSummary);
    await page.getByRole('button', { name: 'Refresh seasons', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Make current season' && !button.disabled));
    await page.getByRole('button', { name: 'Make current season', exact: true }).click();
    assert.equal(requests.length, 0, 'cancelled switch must make no request');
    assert.match(dialogText, /Winter 2026.*Summer 2026/); assert.match(dialogText, /does not publish fixtures or send messages/);
    accept = true;
    await page.getByRole('button', { name: 'Make current season', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.deepEqual(requests.pop(), { action: 'makeCurrent', confirmed: true, expectedCurrentLeagueId: 'old' });
    succeed = true;
    await page.getByRole('button', { name: 'Make current season', exact: true }).click();
    await page.waitForFunction(() => document.body.textContent.includes('Current season: Winter 2026'));
    assert.equal(await page.getByRole('button', { name: 'Make current season', exact: true }).count(), 0);
    requests.length = 0;
    await mount(summary);
    await page.getByPlaceholder('Winter 2026/27').fill('Spring 2027');
    await page.getByRole('button', { name: 'Create private season', exact: true }).click();
    await page.waitForFunction(() => window.testNavigation === '/admin/leagues/created');
    assert.equal(requests[0].copyTeams, true);
    const future = structuredClone(summary); future.seasons[1].publicAt = '2099-01-01';
    await mount(future);
    assert.equal(await page.getByRole('button', { name: 'Make current season', exact: true }).isDisabled(), true);
    fs.mkdirSync('artifacts/private-season', { recursive: true });
    fs.writeFileSync('artifacts/private-season/browser-result.json', JSON.stringify({ passed: true, checks: ['private switch disabled', 'blank name blocked', 'copy checkbox respected', 'errors restore controls', 'refresh loads new visibility', 'cancel makes no request', 'confirmation names both seasons', 'reviewed pointer sent', 'successful switch refreshes current season', 'creation navigates to draft', 'future publication blocked'] }, null, 2));
    console.log('Native private season panel browser checks passed. No external requests or customer data used.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
