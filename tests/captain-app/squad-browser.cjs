const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const { members } = require('./squad-fixture.cjs');

async function main() {
  const output = 'artifacts/captain-app';
  fs.mkdirSync(output, { recursive: true });
  const cssParts = [];
  const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import Squad from './src/components/captain/CaptainAppSquad';
import Mode from './src/components/captain/CaptainPwaModeOnly';
import Header from './src/components/captain/CaptainAppHeader';
import Nav from './src/components/captain/CaptainPwaBottomNav';
const root=createRoot(document.getElementById('root'));const members=${JSON.stringify(members)};
window.actionCalls=[];let key=0;
const action=(kind)=>async(data)=>{window.actionCalls.push({kind,data:Object.fromEntries(data)});if(window.hold)await new Promise(resolve=>window.release=resolve);};
window.show=(options={})=>{history.replaceState({},'',options.web?'/':'/?pwaPreview=1');const rows=options.empty?[]:members.map((m,i)=>options.long&&i===0?{...m,name:'Alexander-With-A-Very-Long-Unbroken-Surname Worthington',email:'averylongplayeraddresswithmanycharacters@example.invalid'}:m);
root.render(<React.Fragment key={++key}><Mode mode='app'><Header teamId='demo' teamName='Dynamo Kebab' teamLogoUrl={null}/></Mode>
<div className='captain-team-container'><main className='captain-team-main'>
<Mode mode='app'><Squad teamId='demo' members={rows} canAddPlayers={!options.managed} savedMessage={options.saved||null} errorMessage={options.error||null} addPlayerAction={action('add')} sendLoginAction={action('login')} setRegularAction={action('regular')}/></Mode>
<Mode mode='web'><h1>Website squad view</h1></Mode></main></div>
<Mode mode='app'><Nav teamId='demo' squadHref='/captain/team/demo/captain-squad' unreadMessageCount={0}/></Mode></React.Fragment>);};window.show();`;
  const bundle = (await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    plugins: [{ name: 'isolated-next-and-styles', setup(b) {
      b.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'next-test' }));
      b.onLoad({ filter: /.*/, namespace: 'next-test' }, args => ({ resolveDir: process.cwd(), contents:
        args.path === 'next/navigation' ? "export const usePathname=()=>'/captain/team/demo/captain-squad';" :
        "import React from 'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}" }));
      b.onLoad({ filter: /\.module\.css$/ }, args => {
        const raw = fs.readFileSync(args.path, 'utf8');
        const prefix = path.basename(args.path).replace(/\W/g, '_') + '_';
        const names = {}; for (const match of raw.matchAll(/\.([a-zA-Z_][\w-]*)/g)) names[match[1]] = prefix + match[1];
        cssParts.push(raw.replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => '.' + names[name]));
        return { contents: `export default ${JSON.stringify(names)}`, loader: 'js' };
      });
    } }] })).outputFiles[0].text;
  const layout = fs.readFileSync('src/app/captain/team/[teamid]/layout.tsx', 'utf8');
  const shellCss = layout.match(/const captainMobileStyles = String.raw`([\s\S]*?)`;/)?.[1];
  assert.ok(shellCss, 'include actual captain shell styles, not a standalone mockup');
  const html = `<!doctype html><html lang='en'><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>
*{box-sizing:border-box}body{margin:0;background:#07130f;color:white;font-family:Arial,sans-serif}button,input{font-family:inherit}
.captain-team-container{max-width:640px;margin:auto;padding:6px 10px 100px}.captain-team-main{min-width:0}
${cssParts.join('\n')}\n${shellCss}</style></head><body><div id='root' class='captain-team-shell'></div><script src='/app.js'></script></body></html>`;
  const publicRoot = path.resolve('public');
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); return; }
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
    const file = path.resolve(publicRoot, '.' + decodeURIComponent(pathname));
    if (file.startsWith(publicRoot + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader('content-type', file.endsWith('.svg') ? 'image/svg+xml' : 'image/png'); res.end(fs.readFileSync(file)); return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  const screen = page.locator('[data-captain-native-squad]');
  const rows = page.getByRole('list', { name: 'Squad members' }).getByRole('listitem');
  async function show(options = {}) {
    await page.evaluate(options => window.show(options), options);
    await (options.web ? page.getByRole('heading', { name: 'Website squad view' }) : screen).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  try {
    await page.goto(origin);
    for (const width of [320, 375, 430, 768]) {
      await page.setViewportSize({ width, height: 812 }); await show();
      assert.equal(await rows.count(), 9);
      const first = await rows.first().boundingBox();
      assert.ok(first.y < 270, `${width}: players must be visible near the top`);
      const fourth = await rows.nth(3).boundingBox();
      const footer = await page.getByRole('navigation', { name: 'Captain quick navigation' }).boundingBox();
      assert.ok(fourth.y + fourth.height < footer.y, `${width}: four complete players visible before scrolling`);
      assert.ok(first.height <= 90, `${width}: collapsed rows are compact`);
      assert.equal(await screen.getByRole('heading', { name: 'Your squad', exact: true }).count(), 0);
      assert.equal(await screen.getByText('Players currently attached to your team.', { exact: true }).count(), 0);
      assert.equal(await screen.getByRole('region', { name: 'Add a player' }).count(), 0);
      assert.equal(await page.getByRole('link', { name: 'Squad', exact: true }).getAttribute('aria-current'), 'page');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      for (const button of await screen.getByRole('button').all()) {
        const box = await button.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, 'touch target');
      }
      await page.screenshot({ path: `${output}/squad-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 375, height: 812 }); await show();
    await page.getByRole('group', { name: 'Filter squad' }).getByRole('button', { name: /^Regulars/ }).click();
    assert.equal(await rows.count(), 3);
    await page.getByRole('group', { name: 'Filter squad' }).getByRole('button', { name: /^Organisers/ }).click();
    assert.equal(await rows.count(), 2);
    await page.getByLabel('Search squad').fill(' MORGAN '); assert.equal(await rows.count(), 1);
    await page.getByLabel('Search squad').fill('nobody'); await page.getByRole('heading', { name: 'No matching players' }).waitFor();
    await page.getByRole('button', { name: 'Show everyone', exact: true }).click(); assert.equal(await rows.count(), 9);
    await page.getByLabel('Search squad').fill('#7'); assert.equal(await rows.count(), 1);
    await rows.first().getByRole('button', { name: /Show player details/ }).click();
    assert.equal(await screen.getByRole('button', { name: 'Send sign-in email', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.actionCalls.length), 0, 'navigation/filtering never changes a player or sends an email');
    await show();
    await rows.first().getByRole('button', { name: /Show player details/ }).click();
    assert.equal(await screen.getByRole('link', { name: 'Edit player', exact: true }).getAttribute('href'), '/captain/team/demo/captain-squad/member-1/edit');
    assert.equal(await screen.getByRole('link', { name: 'WhatsApp Chris Morgan', exact: true }).getAttribute('href'), 'https://wa.me/447700900123');
    await screen.getByText('Defender', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/squad-player-details-375.png`, fullPage: true });
    await page.evaluate(() => window.hold = true);
    await screen.getByRole('button', { name: 'Remove from regulars', exact: true }).click();
    await screen.getByRole('button', { name: 'Saving…', exact: true }).waitFor();
    assert.equal(await screen.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.actionCalls[0]), { kind: 'regular', data: { teamid: 'demo', membershipId: 'member-1', isRegular: 'false', returnTo: 'captain-squad' } });
    await page.evaluate(() => { window.hold = false; window.release(); });
    await screen.getByRole('button', { name: 'Remove from regulars', exact: true }).waitFor();
    await screen.getByRole('button', { name: 'Send sign-in email', exact: true }).click();
    await page.waitForFunction(() => window.actionCalls.length === 2);
    assert.deepEqual(await page.evaluate(() => window.actionCalls[1]), { kind: 'login', data: { teamid: 'demo', membershipId: 'member-1' } });
    await screen.getByRole('button', { name: '+ Add player', exact: true }).click();
    const add = screen.getByRole('region', { name: 'Add a player', exact: true });
    await add.getByLabel('Player name', { exact: true }).fill('Test New Player');
    await add.getByRole('button', { name: 'Add player', exact: true }).click();
    assert.equal(await page.evaluate(() => window.actionCalls.length), 2, 'missing email cannot submit');
    await add.getByLabel('Player email', { exact: true }).fill('new.player@example.invalid');
    await add.getByLabel(/Shirt no/).fill('20');
    await add.getByLabel('Player uses WhatsApp', { exact: true }).check();
    await add.getByRole('button', { name: 'Add player', exact: true }).click();
    await page.waitForFunction(() => window.actionCalls.length === 3);
    const added = await page.evaluate(() => window.actionCalls[2]);
    assert.equal(added.kind, 'add'); assert.equal(added.data.teamid, 'demo'); assert.equal(added.data.displayName, 'Test New Player');
    assert.equal(added.data.email, 'new.player@example.invalid'); assert.equal(added.data.squadNumber, '20'); assert.equal(added.data.usesWhatsapp, 'on');
    await show({ managed: true });
    assert.equal(await screen.getByRole('button', { name: '+ Add player', exact: true }).count(), 0);
    assert.equal(await screen.getByRole('link', { name: 'Contact SIXFL', exact: true }).getAttribute('href'), '/captain/team/demo/help');
    await show({ empty: true }); await screen.getByRole('heading', { name: 'Your squad is empty' }).waitFor();
    await show({ error: 'Please check this player.', saved: 'Player saved.' });
    await screen.getByRole('alert').getByText('Please check this player.').waitFor();
    await screen.getByText('Player saved.', { exact: true }).waitFor();
    await page.setViewportSize({ width: 320, height: 812 }); await show({ long: true });
    await rows.first().getByRole('button', { name: /Show player details/ }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/squad-long-name-320.png`, fullPage: true });
    await show({ web: true }); assert.equal(await screen.count(), 0, 'native app UI is not rendered in normal website mode');
    assert.deepEqual(errors, []);
    console.log('Squad browser checks passed: 320/375/430/768px, four players above fold, search, filters, details, exact action payloads, pending states, email guard, managed and web modes, empty/error states and long names. No production data or actions used.');
  } catch (error) {
    await page.screenshot({ path: `${output}/squad-failure.png`, fullPage: true }); throw error;
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
