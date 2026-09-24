const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { renderScreen } = require('./render.cjs');

async function main() {
  fs.mkdirSync('artifacts/captain-app', { recursive: true });
  const ownedCss = fs.readFileSync('src/components/captain/CaptainAppScreens.module.css', 'utf8');
  const layout = fs.readFileSync('src/app/captain/team/[teamid]/layout.tsx', 'utf8');
  const shellCss = layout.match(/const captainMobileStyles = String.raw`([\s\S]*?)`;/)?.[1];
  assert.ok(shellCss, 'exercise the real shared captain shell CSS too');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.route('**/*', route => route.abort());
    async function show(options = {}) {
      const { html } = await renderScreen(options);
      await page.setContent(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#07130f;color:white}
        .captain-team-container{max-width:640px;margin:auto;padding:6px 10px 100px}.captain-team-main{min-width:0}
        ${ownedCss}\n${shellCss}
        </style></head><body><div class="captain-team-shell">${html}</div></body></html>`);
    }
    for (const width of [320, 375, 430, 768]) {
      await page.setViewportSize({ width, height: 812 });
      await show();
      assert.equal(await page.locator('h1').innerText(), 'Dynamo Kebab');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const tabs = page.locator('nav[aria-label="Captain quick navigation"] a');
      assert.equal(await tabs.count(), 6);
      for (let i = 0; i < 6; i++) {
        const box = await tabs.nth(i).boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `${width}: ${i} tap target`);
        assert.ok(await tabs.nth(i).isVisible());
        assert.ok(await tabs.nth(i).evaluate(el => el.scrollWidth <= el.clientWidth), `${width}: tab text not clipped`);
      }
      assert.ok((await page.locator('[data-captain-native-match]').boundingBox()).height < 80);
      await page.screenshot({ path: `artifacts/captain-app/home-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 320, height: 812 });
    await show({ teamName: 'Harrogate Naija Isolo FC Development Squad', data: { openIssues: 2, overdueConfirmations: 3 } });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.locator('h1').innerText(), 'Harrogate Naija Isolo FC Development Squad');
    await page.screenshot({ path: 'artifacts/captain-app/long-name-320.png', fullPage: true });
    await show({ data: { nextFixture: null, reportsDue: 0 } });
    assert.equal(await page.getByText('No match scheduled', { exact: true }).count(), 1);
    await show({ more: true, pathname: '/captain/team/demo/more' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('link', { name: 'Help / Contact SIXFL', exact: true }).scrollIntoViewIfNeeded();
    const last = await page.getByRole('link', { name: 'Help / Contact SIXFL', exact: true }).boundingBox();
    const footer = await page.locator('nav[aria-label="Captain quick navigation"]').boundingBox();
    assert.ok(last.y + last.height <= footer.y, 'last menu action is not obscured by the footer');
    await page.screenshot({ path: 'artifacts/captain-app/more-320.png', fullPage: true });
    console.log('Captain component browser layouts passed: 320/375/430/768, long name, empty state, alerts and More.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
