const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { chromium } = require(process.env.SEASON_BROWSER_TOOLS + '/node_modules/playwright');
const source = fs.readFileSync('src/components/admin/leagues/AdminLeagueSeasonsBridge.tsx', 'utf8') + '\nexport { createPanel };';
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const bootstrap = 'window.exports = {}; window.require = () => ({});\n' + compiled;
const summary = {
  competition: { id: 'c', name: 'Test league', currentLeagueId: 'old' },
  seasons: [
    { id: 'old', name: 'Test league', season: 'Summer 2026', isActive: true, publicAt: '2026-01-01', isCurrent: true, teamCount: 2, fixtureCount: 12, completedFixtureCount: 12 },
    { id: 'new', name: 'Test league', season: 'Winter 2026', isActive: true, publicAt: null, isCurrent: false, teamCount: 2, fixtureCount: 0, completedFixtureCount: 0 },
  ],
};
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const requests = [];
    let accept = false;
    let dialogText = '';
    page.on('dialog', async dialog => { dialogText = dialog.message(); accept ? await dialog.accept() : await dialog.dismiss(); });
    await page.route('**/*', async route => {
      if (route.request().method() === 'POST') {
        requests.push(route.request().postDataJSON());
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Current season changed. Refresh and review.' }) });
      } else {
        await route.fulfill({ contentType: 'text/html', body: '<html><body><main></main></body></html>' });
      }
    });
    async function mount(data) {
      await page.goto('https://season-ui.invalid/admin/leagues/new');
      await page.addScriptTag({ content: bootstrap });
      await page.evaluate(summary => document.querySelector('main').appendChild(window.exports.createPanel({ leagueId: 'new', summary })), data);
    }
    await mount(summary);
    assert.equal(await page.getByRole('button', { name: 'Make current season', exact: true }).isDisabled(), true);
    assert.ok((await page.locator('body').innerText()).includes('Private draft'));
    assert.ok(!(await page.locator('body').innerText()).includes('Previous season'));
    await page.getByRole('button', { name: 'Create private season', exact: true }).click();
    assert.equal(requests.length, 0, 'missing name must not create anything');
    await page.getByPlaceholder('Winter 2026/27').fill('Spring 2027');
    await page.getByRole('checkbox').uncheck();
    await page.getByRole('button', { name: 'Create private season', exact: true }).click();
    await page.getByText('Current season changed. Refresh and review.', { exact: true }).waitFor();
    assert.deepEqual(requests.pop(), { action: 'createSeason', seasonName: 'Spring 2027', copyTeams: false });
    assert.equal(await page.getByRole('button', { name: 'Create private season', exact: true }).isEnabled(), true);
    const publicSummary = structuredClone(summary); publicSummary.seasons[1].publicAt = '2026-01-01';
    await mount(publicSummary);
    await page.getByRole('button', { name: 'Make current season', exact: true }).click();
    assert.equal(requests.length, 0, 'cancelled switch must make no request');
    assert.match(dialogText, /Winter 2026.*Summer 2026/); assert.match(dialogText, /does not publish fixtures or send messages/);
    accept = true;
    await page.getByRole('button', { name: 'Make current season', exact: true }).click();
    await page.getByText('Current season changed. Refresh and review.', { exact: true }).waitFor();
    assert.deepEqual(requests.pop(), { action: 'makeCurrent', confirmed: true, expectedCurrentLeagueId: 'old' });
    const future = structuredClone(summary); future.seasons[1].publicAt = '2099-01-01';
    await mount(future);
    assert.equal(await page.getByRole('button', { name: 'Make current season', exact: true }).isDisabled(), true);
    fs.mkdirSync('artifacts/private-season', { recursive: true });
    fs.writeFileSync('artifacts/private-season/browser-result.json', JSON.stringify({ passed: true, checks: ['private switch disabled', 'blank name blocked', 'copy checkbox respected', 'errors restore controls', 'cancel makes no request', 'confirmation names both seasons', 'reviewed pointer sent', 'future publication blocked'] }, null, 2));
    console.log('Private season creation and switch browser checks passed. No external requests or customer data used.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
