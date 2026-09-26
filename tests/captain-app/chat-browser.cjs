const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');

async function main() {
  fs.mkdirSync('artifacts/captain-app', { recursive: true });
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';
    import Nav from './src/components/captain/CaptainPwaBottomNav';
    import Header from './src/components/captain/CaptainAppHeader';
    const root=createRoot(document.getElementById('root'));
    window.pathname='/captain/team/demo';window.team='demo';window.requests=[];
    window.nextCount=7;window.httpStatus=200;window.hold=false;window.pending=[];
    window.fetch=async(url,opts={})=>{
      window.requests.push({url,method:opts.method||'GET'});
      const count=window.nextCount,status=window.httpStatus;
      if(window.hold)await new Promise(resolve=>window.pending.push(resolve));
      return new Response(JSON.stringify({unreadCount:count}),{status});
    };
    window.show=(team='demo',pathname='/captain/team/demo')=>{
      window.team=team;window.pathname=pathname;
      root.render(<><Header teamId={team} teamName='Dynamo Kebab' teamLogoUrl={null}/>
        <main style={{padding:16}}>Captain app navigation test</main>
        <Nav teamId={team} squadHref={'/captain/team/'+team+'/captain-squad'} unreadMessageCount={36}/></>);
    };
    window.clear=()=>root.render(null);window.show();`;
  const bundle = (await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{
      name: 'isolated-next-and-css', setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'mock' }));
        b.onLoad({ filter: /^navigation$/, namespace: 'mock' }, () => ({ contents: 'export const usePathname=()=>window.pathname;' }));
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'mock' }));
        b.onLoad({ filter: /^link$/, namespace: 'mock' }, () => ({ resolveDir: process.cwd(), contents: `import React from 'react';export default function Link({children,...props}){return React.createElement('a',{...props,onClick:e=>{e.preventDefault();window.show(window.team,new URL(props.href,location.origin).pathname);}},children);}` }));
        b.onLoad({ filter: /\.module\.css$/ }, () => ({ loader: 'js', contents: 'export default new Proxy({}, {get:(_,key)=>String(key)});' }));
      },
    }] })).outputFiles[0].text;
  const css = fs.readFileSync('src/components/captain/CaptainAppScreens.module.css', 'utf8');
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); }
    else { res.setHeader('content-type', 'text/html'); res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif;background:#07130f;color:white}${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [];page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const nav = page.getByRole('navigation', { name: 'Captain quick navigation' });
  const focusRefresh = () => page.evaluate(() => window.dispatchEvent(new Event('focus')));
  try {
    await page.goto(origin);
    for (const width of [320, 375, 430, 768]) {
      await page.setViewportSize({ width, height: 812 });
      await page.evaluate(() => { window.nextCount = 7; window.show('demo', '/captain/team/demo'); });
      await focusRefresh();
      const chat = nav.getByRole('link', { name: 'Chat, 7 unread', exact: true });
      await chat.waitFor();
      assert.equal(await chat.getAttribute('href'), '/captain/team/demo/chat');
      assert.equal(await nav.getByRole('link', { name: /Inbox/ }).count(), 0);
      await chat.click();
      await page.waitForFunction(() => document.querySelector('.headerTitle span')?.textContent === 'Captain Portal · Chat');
      await nav.locator('a[aria-current="page"]').getByText('Chat', { exact: true }).waitFor();
      assert.equal(await nav.locator('a[aria-current="page"]').count(), 1);
      assert.equal(await nav.getByRole('link').count(), 6);
      for (const link of await nav.getByRole('link').all()) {
        const box = await link.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `tap target at ${width}`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 375) await page.screenshot({ path: 'artifacts/captain-app/chat-tab-375.png' });
    }
    await page.evaluate(() => { window.nextCount = 137; });await focusRefresh();
    await nav.getByRole('link', { name: 'Chat, 137 unread' }).waitFor();
    assert.equal(await nav.getByText('99+', { exact: true }).count(), 1);
    await page.evaluate(() => { window.nextCount = 0; });await focusRefresh();
    await nav.getByRole('link', { name: 'Chat', exact: true }).waitFor();
    assert.equal(await nav.locator('.unread').count(), 0);
    for (const invalid of [-1, '7', null]) {
      await page.evaluate(value => { window.nextCount = value; }, invalid);await focusRefresh();
      await nav.getByRole('link', { name: 'Chat', exact: true }).waitFor();
    }
    await page.evaluate(() => { window.nextCount = 9; });await focusRefresh();
    await nav.getByRole('link', { name: 'Chat, 9 unread', exact: true }).waitFor();
    await page.evaluate(() => { window.httpStatus = 500; });await focusRefresh();
    await nav.getByRole('link', { name: 'Chat', exact: true }).waitFor();
    assert.equal(await nav.locator('.unread').count(), 0);

    // Hold the old team's request and ignore its abort to prove late responses
    // still cannot populate the new team's badge.
    await page.evaluate(() => { window.httpStatus = 200; window.nextCount = 88; window.hold = true; });
    await focusRefresh();await page.waitForFunction(() => window.pending.length > 0);
    await page.evaluate(() => { window.hold = false; window.nextCount = 2; window.show('other', '/captain/team/other/chat'); });
    await nav.getByRole('link', { name: 'Chat, 2 unread', exact: true }).waitFor();
    await page.evaluate(() => { for (const resolve of window.pending.splice(0)) resolve(); });
    await page.waitForTimeout(50);
    assert.equal(await nav.getByRole('link', { name: 'Chat, 2 unread', exact: true }).getAttribute('href'), '/captain/team/other/chat');
    await page.evaluate(() => window.show('other', '/captain/team/other/messages'));
    await page.waitForFunction(() => document.querySelector('.headerTitle strong')?.textContent === 'SIXFL inbox');
    assert.equal(await nav.locator('a[aria-current="page"]').getAttribute('aria-label'), 'More');
    const requests = await page.evaluate(() => window.requests);
    assert.ok(requests.some(r => r.url === '/api/player/team/demo/chat-unread'));
    assert.ok(requests.some(r => r.url === '/api/player/team/other/chat-unread'));
    assert.ok(requests.every(r => r.method === 'GET' && r.url.endsWith('/chat-unread')));
    await page.evaluate(() => window.clear());await nav.waitFor({ state: 'detached' });
    const before = await page.evaluate(() => window.requests.length);
    await focusRefresh();assert.equal(await page.evaluate(() => window.requests.length), before);
    assert.deepEqual(errors, []);
    console.log('Chat navigation passed at 320/375/430/768px; destinations, active header/tab, per-user unread refresh, zero/error states, stale-team races and cleanup verified with no live messages.');
  } catch (error) {
    await page.screenshot({ path: 'artifacts/captain-app/chat-tab-failure.png', fullPage: true });throw error;
  } finally { await browser.close();await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error);process.exitCode = 1; });
