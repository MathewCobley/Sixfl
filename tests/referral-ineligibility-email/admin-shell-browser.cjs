const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require(process.env.REFERRAL_PLAYWRIGHT || 'playwright');
const { renderReferralLayout } = require('./layout-fixture.cjs');

(async () => {
  const { html } = await renderReferralLayout();
  // Run the ACTUAL admin layout as well as the actual referral route output.
  // Auth/read services and unrelated navigation widgets are isolated. The old
  // email helper is explicitly NOT mocked: the frozen module is a negative
  // control proving it alone reproduces the post-render 720px restriction.
  const mocks = {
    'next/link': 'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)}',
    'next/navigation': 'export const usePathname=()=>"/admin/referrals";',
    '@prisma/client': 'export const ResultDisputeStatus={OPEN:"OPEN",REVIEW:"REVIEW"};',
    '@/lib/requireAdmin': 'export const requireAdmin=async()=>({user:{id:"test-admin",name:"Test administrator",role:"ADMIN"}});',
    '@/lib/messaging/service': 'export const getAdminInboxSummary=async()=>({unreadThreads:0});',
    '@/lib/night-board/next-night-issues': 'export const getNextNightBoardIssueSummary=async()=>({count:0});',
    '@/lib/prisma': 'export const prisma={resultDispute:{count:async()=>0}};',
  };
  const source = `
    import React,{useEffect} from 'react';
    import {createRoot} from 'react-dom/client';
    import Layout from './src/app/(admin)/admin/layout';
    import EmailHtmlPreview from './src/components/admin/email/EmailHtmlPreview';
    import Legacy from './tests/referral-ineligibility-email/fixtures/legacy-email-layout';
    function Ready(){useEffect(()=>{requestAnimationFrame(()=>requestAnimationFrame(()=>{window.layoutReady=true}))},[]);return null}
    async function start(){
      const child=<div><div data-referral-route dangerouslySetInnerHTML={{__html:${JSON.stringify(html)}}}/>
        <section data-native-email className="mt-5 rounded-xl bg-white p-4 text-slate-900">
          <h2>Native email preview</h2><EmailHtmlPreview title="Native stored email" html={'<style>body{background:rgb(255,0,0);width:2000px}</style><p>Stored SIXFL email remains inside its frame.</p>'}/>
        </section></div>;
      const shell=await Layout({children:child});
      createRoot(document.getElementById('root')).render(<>{shell}{location.search.includes('legacy=1')?<Legacy/>:null}<Ready/></>);
    }
    start().catch(error=>{console.error(error);window.layoutFailure=String(error)});
  `;
  const js = (await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'isolated-admin-services', setup(api) {
      api.onResolve({ filter: /^(?:@\/|next\/|@prisma\/client$)/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'test-mock' };
        if (args.path.startsWith('@/components/')) {
          if (/QueuedSmsReasonHints|AdminEmailPreviewLayoutBridge/.test(args.path)) {
            return { path: path.resolve('src', args.path.slice(2) + '.tsx') };
          }
          return { path: 'widget', namespace: 'test-mock' };
        }
        throw new Error('Unexpected admin dependency: ' + args.path);
      });
      api.onLoad({ filter: /.*/, namespace: 'test-mock' }, args => ({
        contents: mocks[args.path] || 'export default function TestWidget(){return null}',
        loader: 'js', resolveDir: process.cwd(),
      }));
    } }],
  })).outputFiles[0].text;
  const css = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.css')) css.push(fs.readFileSync(file, 'utf8'));
    }
  }
  walk('.next/static');
  assert.ok(css.join('').includes('.sixfl-referral-summary'));
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(req.url === '/app.js' ? js : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.join('\n')}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = 'artifacts/referral-ineligibility-email';
  fs.mkdirSync(dir, { recursive: true });
  let browser;
  const measurements = [];
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, legacy] of [[1920, true], [390, false], [768, false], [1280, false], [1440, false], [1920, false]]) {
      const page = await browser.newPage({ viewport: { width, height: 1100 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await page.goto(`http://127.0.0.1:${server.address().port}/?legacy=${legacy ? 1 : 0}`);
        await page.waitForFunction(() => window.layoutReady || window.layoutFailure);
        assert.equal(await page.evaluate(() => window.layoutFailure), undefined);
        await page.locator('.sixfl-referral-card').first().getByText('View recorded email', { exact: true }).click();
        // Cause the same child-list mutations as opening/refreshing email status.
        await page.evaluate(async () => {
          const host = document.querySelector('.sixfl-referral-details');
          const probe = document.createElement('span'); probe.textContent = 'SIXFL status refresh';
          host.append(probe);
          await new Promise(resolve => requestAnimationFrame(resolve)); probe.remove();
          await new Promise(resolve => requestAnimationFrame(resolve));
        });
        const bounds = await page.evaluate(() => {
          const list = document.querySelector('.sixfl-referral-list');
          const card = list.querySelector('.sixfl-referral-card');
          const summary = card.querySelector('.sixfl-referral-summary');
          const details = card.querySelector('.sixfl-referral-details');
          const frame = document.querySelector('iframe[title="Native stored email"]');
          const rect = el => el.getBoundingClientRect().width;
          const style = getComputedStyle(frame.parentElement);
          return { list: rect(list), card: rect(card), summary: rect(summary), details: rect(details),
            restrictedMax: list.firstElementChild.style.maxWidth, background: getComputedStyle(list).backgroundColor,
            rewritten: document.querySelectorAll('[data-message-email-preview-fixed],[data-email-preview-fixed]').length,
            overflow: document.documentElement.scrollWidth > innerWidth,
            iframe: rect(frame), iframeSpace: frame.parentElement.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
        });
        measurements.push({ width, legacy, ...bounds });
        if (legacy) {
          assert.equal(bounds.restrictedMax, '720px', 'original helper must reproduce the real post-render restriction');
          assert.ok(bounds.card <= 720 && bounds.list - bounds.card > 100);
          assert.equal(bounds.background, 'rgb(243, 244, 246)');
        } else {
          assert.equal(bounds.rewritten, 0, 'no global email-frame mutations after client effects');
          assert.equal(bounds.restrictedMax, '');
          assert.ok(Math.abs(bounds.list - bounds.card) < 4, 'list children fill the available width');
          assert.ok(Math.abs(bounds.summary - bounds.details) < 2, 'decision fills the summary width');
          assert.equal(bounds.background, 'rgb(255, 255, 255)');
          assert.equal(bounds.overflow, false);
          assert.ok(Math.abs(bounds.iframe - bounds.iframeSpace) < 2, 'real email preview remains responsive');
          assert.equal(await page.locator('.sixfl-referral-card').first().getByRole('button', { name: 'Email referrer', exact: true }).count(), 0);
        }
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `${dir}/admin-shell-${legacy ? 'before' : 'fixed'}-${width}.png`, fullPage: true });
        console.log('PASS hydrated admin shell', { width, legacy, ...bounds });
      } catch (error) {
        await page.screenshot({ path: `${dir}/admin-shell-failure-${width}.png`, fullPage: true });
        throw error;
      } finally { await page.close(); }
    }
  } finally {
    fs.writeFileSync(`${dir}/admin-shell-measurements.json`, JSON.stringify(measurements, null, 2));
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
