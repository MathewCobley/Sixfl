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
  const requests = page.getByRole('region', { name: 'Veo Priority requests', exact: true });
  await requests.getByText('1 pending', { exact: true }).waitFor();
  await requests.getByRole('button', { name: 'Approve Priority request', exact: true }).click();
  await requests.getByRole('alert').filter({ hasText: 'Sign in as an administrator' }).waitFor();
  await requests.getByText('1 pending', { exact: true }).waitFor();
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

  // These HTML artifacts are rendered from the real component and its shared
  // fields after prebuild; only server auth/data are isolated by the unit harness.
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href));
  const shell = name => `<!doctype html><html><head>${styles.map(href => `<link rel="stylesheet" href="${href}">`).join('')}</head><body style="background:#080808"><main class="mx-auto max-w-5xl p-4">${readFileSync(`artifacts/veo/${name}.html`, 'utf8')}</main></body></html>`;
  const promo = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await promo.setContent(shell('captain-promo'), { waitUntil: 'networkidle' });
  const liveCard = promo.getByRole('region', { name: 'Veo Priority', exact: true });
  await liveCard.getByRole('heading', { name: 'How to switch it on', exact: true }).waitFor();
  assert.equal(await liveCard.getByRole('button', { name: 'Request Veo Priority', exact: true }).isDisabled(), false);
  assert.equal(await liveCard.getByRole('checkbox').isDisabled(), false);
  assert.equal(await promo.getByRole('complementary', { name: 'Veo preview notice' }).count(), 0);
  const captainCopy = (await liveCard.innerText()).replace(/\s+/g, ' ').trim();
  assert.ok(await promo.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Captain promo must fit mobile');
  await promo.screenshot({ path: 'artifacts/veo/captain-promo-mobile.png', fullPage: true });
  await promo.setViewportSize({ width: 1440, height: 1000 });
  await promo.screenshot({ path: 'artifacts/veo/captain-promo-desktop.png', fullPage: true });

  for (const name of ['admin-preview', 'captain-preview']) {
    const preview = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const posts = [];
    preview.on('request', request => { if (request.method() !== 'GET') posts.push(request.url()); });
    await preview.setContent(shell(name), { waitUntil: 'networkidle' });
    const card = preview.getByRole('region', { name: 'Veo Priority', exact: true });
    const button = card.getByRole('button', { name: 'Request Veo Priority', exact: true });
    await button.waitFor();
    assert.equal((await card.innerText()).replace(/\s+/g, ' ').trim(), captainCopy, 'Preview must retain the exact captain-facing offer and instructions');
    assert.equal(await button.isDisabled(), true);
    assert.equal(await card.getByRole('checkbox').isDisabled(), true);
    assert.equal(await button.getAttribute('type'), 'button');
    assert.equal(await preview.locator('form').count(), 0);
    assert.equal(await preview.locator('input[type="hidden"]').count(), 0);
    await preview.getByRole('complementary', { name: 'Veo preview notice' }).waitFor();
    assert.equal(await card.getByRole('complementary').count(), 0, 'Preview explanation must not replace customer content');
    assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} must fit mobile`);
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    assert.ok(box);
    await preview.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await preview.keyboard.press('Enter');
    await preview.keyboard.press('Space');
    assert.equal(await card.getByRole('checkbox').isChecked(), false);
    assert.deepEqual(posts, [], 'Preview interactions must not submit a request');
    await preview.screenshot({ path: `artifacts/veo/${name}-mobile.png`, fullPage: true });
    await preview.setViewportSize({ width: 1440, height: 1000 });
    await preview.screenshot({ path: `artifacts/veo/${name}-desktop.png`, fullPage: true });
    await preview.close();
  }
  console.log('PASS: request queue, anonymous review refusal, captain offer and activation instructions, identical safe admin/captain previews on phone and desktop, OFF state, saved fee rows and completed-fixture video edits.');
} finally { await browser.close(); }
