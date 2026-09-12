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
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href));
  for (const name of ['confirmation-live','confirmation-preview','confirmation-ongoing']) {
    const promo = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const posts=[];promo.on('request',r=>{if(r.method()!=='GET')posts.push(r.url());});
    await promo.setContent(`<!doctype html><html><head>${styles.map(href => `<link rel="stylesheet" href="${href}">`).join('')}</head><body style="background:#080808"><main class="mx-auto max-w-5xl p-4">${readFileSync(`artifacts/veo/${name}.html`, 'utf8')}</main></body></html>`, { waitUntil: 'networkidle' });
    const radios=promo.getByRole('radio');assert.equal(await radios.count(),3);
    const match=promo.locator('input[value="MATCH"]');const ongoing=promo.locator('input[value="ONGOING"]');
    if(name==='confirmation-preview') {
      assert.ok(await match.isDisabled());assert.equal(await promo.locator('form').count(),0);
      const button=promo.getByRole('button',{name:'Confirm our team can play'});assert.ok(await button.isDisabled());
      const box=await button.boundingBox();await promo.mouse.click(box.x+5,box.y+5);assert.deepEqual(posts,[]);
    }else{await match.check();assert.ok(await match.isChecked());await ongoing.check();assert.ok(await ongoing.isChecked());}
    assert.ok(await promo.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} must fit mobile`);
    await promo.screenshot({path:`artifacts/veo/${name}-mobile.png`,fullPage:true});
    await promo.setViewportSize({width:1440,height:1000});await promo.screenshot({path:`artifacts/veo/${name}-desktop.png`,fullPage:true});await promo.close();
  }
  console.log('PASS: native fixture choices, radio changes, safe preview, phone/desktop and legacy admin recording controls.');
} finally { await browser.close(); }
