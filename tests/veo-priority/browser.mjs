import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const seed = JSON.parse(readFileSync('artifacts/veo/seed.json', 'utf8'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:3100/admin/leagues/${seed.leagueId}/veo-priority?date=${seed.date}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Veo Priority', exact: true }).waitFor();
  await page.getByText('OFF for this league', { exact: true }).waitFor();
  assert.equal(await page.locator('select').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Mobile page must not overflow horizontally');
  assert.equal(await page.locator('article').count(), 6);
  await page.screenshot({ path: 'artifacts/veo/admin-mobile.png', fullPage: true });
  const completed = page.locator('article').filter({ hasText: 'Veo test team 3 vs Veo test team 4' });
  await completed.locator('summary').click();
  await completed.locator('input[name="videoUrl"]').fill('https://www.youtube.com/watch?v=veo-pilot-test');
  await completed.getByRole('button', { name: 'Save video link', exact: true }).click();
  await page.getByText('Saved. No existing fixtures or charges were recalculated.', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await completed.locator('input[name="videoUrl"]').inputValue(), 'https://www.youtube.com/watch?v=veo-pilot-test');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'artifacts/veo/admin-desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: mobile layout, OFF state, saved fee rows and completed-fixture video edits.');
} finally { await browser.close(); }
