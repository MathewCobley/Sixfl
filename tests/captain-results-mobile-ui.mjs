import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium, webkit } from 'playwright';
const require = createRequire(import.meta.url);
const { fixtureData } = require('./captain-results-mobile.test.cjs');
const data = JSON.stringify(fixtureData());
const output = path.resolve('/tmp/sixfl-results-browser');
fs.mkdirSync(output, { recursive: true });
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Page from './src/app/captain/team/[teamid]/results/page';
window.__submissions = [];
function capture(node) {
  if (!React.isValidElement(node)) return node;
  const props = {};
  if (node.type === 'form' && typeof node.props.action === 'function') {
    const actionName = node.props.action.name;
    props.action = async form => { window.__submissions.push({ actionName, fields: [...form.entries()] }); };
  }
  return React.cloneElement(node, props, React.Children.map(node.props.children, capture));
}
(async () => {
  const tree = await Page({ params: Promise.resolve({teamid:'team-a'}), searchParams: Promise.resolve({}) });
  createRoot(document.getElementById('root')).render(capture(tree));
  window.__ready = true;
})();`;
await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, outfile: path.join(output, 'app.js'), platform: 'browser', format: 'iife', jsx: 'automatic',
  loader: { '.css': 'local-css' },
  plugins: [{ name: 'isolated-results-data', setup(builder) {
    const mocks = {
      // This fixture contains an official result; pending reports are exercised separately.
      '@/components/captain/EarlyMatchReports': 'export default function PendingReports(){return null;}',
      '@/lib/prisma': `const d=${data}; d.fixture.kickoffAt=new Date(d.fixture.kickoffAt);d.fixture.result.enteredAt=new Date(d.fixture.result.enteredAt); export const prisma={team:{findUnique:async()=>d.team},fixture:{findMany:async()=>[d.fixture]}};`,
      '@/lib/requireCaptain': 'export const requireCaptain=async()=>({user:{id:"test-captain"}});',
      '@/lib/playerMatchPerformances': `export const getMatchPerformances=async()=>(${data}).performances; export const replaceMatchPerformances=()=>{throw Error('Never write in UI tests')};`,
      '@/lib/datetime/london': 'export const formatDateTimeInLondon=()=>"Test match date";',
      '@/lib/fixtures/result-score': 'export const RESULT_OVERTURN_SUMMARY_SELECT={};export const getPredictorResult=r=>({homeScore:r.homeScore,awayScore:r.awayScore});',
      '@/components/fixtures/OverturnedResultNotice': 'export default function Notice(){return null;}',
      'next/cache': 'export const revalidatePath=()=>{};',
      'next/navigation': 'export const notFound=()=>{throw Error("Not found")};export const redirect=()=>{throw Error("Not used")};',
      '@prisma/client': 'export const ResultDisputeStatus={OPEN:"OPEN",REVIEW:"REVIEW"};',
    };
    builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'isolated' } : null);
    builder.onLoad({ filter: /.*/, namespace: 'isolated' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const styles = await postcss([tailwind()]).process('@import "tailwindcss";', { from: path.resolve('results-browser.css') });
fs.writeFileSync(path.join(output, 'tailwind.css'), styles.css);
const layoutSource = fs.readFileSync('src/app/captain/team/[teamid]/layout.tsx','utf8');
const shellStyles = layoutSource.match(/const captainMobileStyles = String.raw`([\s\S]*?)`;/)?.[1] || '';
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#07140f;color:white;font-family:Arial,sans-serif}.captain-team-container{padding:24px}.captain-team-main{min-width:0;max-width:1250px;margin:auto}${shellStyles}</style></head><body><div class="captain-team-shell"><div class="captain-team-container"><main class="captain-team-main" id="root"></main></div></div><script src="/app.js"></script></body></html>`;
const server = createServer((req,res) => {
  const file = { '/app.js':'app.js','/app.css':'app.css','/tailwind.css':'tailwind.css' }[req.url];
  res.setHeader('Content-Type', file ? (file.endsWith('.js') ? 'text/javascript' : 'text/css') : 'text/html');
  res.end(file ? fs.readFileSync(path.join(output,file)) : html);
});
server.listen(0,'127.0.0.1'); await once(server,'listening');
const url = `http://127.0.0.1:${server.address().port}`;
const artifacts = 'artifacts/captain-results-mobile'; fs.mkdirSync(artifacts,{recursive:true});
async function contained(page, locator, minHeight = 43) {
  for (const el of await locator.all()) {
    // Playwright can scroll an overflow-hidden ancestor sideways to reach a
    // clipped field. Reject that layout before its actionability auto-scroll.
    const rowWidth = await el.evaluate(node => node.closest('[data-match-player-fields]')?.getBoundingClientRect().width ?? 0);
    assert.ok(rowWidth <= page.viewportSize().width + 1, `Player controls require horizontal scrolling: ${rowWidth}px`);
    // Wait for actual actionability, including the existing listbox's leave
    // transition and viewport resize, before making a geometry snapshot.
    await el.click({trial:true,timeout:5000});
    const box = await el.boundingBox();
    assert.ok(box && box.x >= -1 && box.x+box.width <= page.viewportSize().width+1, `Off-screen field ${JSON.stringify(box)}`);
    assert.ok(box.height >= minHeight, `Control too short: ${box.height}`);
    const hit = await el.evaluate(node => {
      const r=node.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {matches:node===top||node.contains(top),target:node.outerHTML,top:top?.outerHTML?.slice(0,400)};
    });
    assert.equal(hit.matches,true,`Control is covered or clipped: ${JSON.stringify(hit)}`);
  }
}
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({headless:true});
    try {
      for (const width of [320,390,430,768,1360]) {
        const page = await browser.newPage({viewport:{width,height:844}}), errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
        try {
          await page.goto(url); await page.waitForSelector('[data-match-player-fields]');
          const form=page.locator('#edit-match-result-a');
          assert.equal(await form.locator('[data-match-player]').count(),12);
          if(width<1280) await page.getByRole('link',{name:'Add scorers & match details'}).click();
          await contained(page,form.locator('[data-match-player="player-0"] input[type="number"]'));
          await contained(page,form.locator('[data-match-player="player-1"] input[type="number"]'));
          await form.getByRole('spinbutton',{name:'Goals for Test Player 0',exact:true}).fill('2');
          await form.getByRole('spinbutton',{name:'Assists for Test Player 0',exact:true}).fill('1');
          const rating = form.getByRole('spinbutton',{name:'Rating for Test Player 0',exact:true});
          assert.equal(await rating.getAttribute('step'),'0.1');
          for (const [value, valid] of [['0',false],['10.1',false],['9.25',false],['',true],['1',true],['10',true],['9',true],['9.5',true],['9.2',true]]) {
            await rating.fill(value);
            assert.equal(await rating.evaluate(node=>node.checkValidity()),valid,`Rating ${value} validity`);
          }
          // The final rating remains exactly 9.2, not a rounded half-point.
          assert.equal(await form.evaluate(node=>node.checkValidity()),true);
          const pom=form.locator('input[name="playerOfMatchTeamMemberId"]').locator('..');
          await pom.getByRole('button').click();
          await pom.getByRole('option',{name:'Test Player 2',exact:true}).click();
          await pom.getByRole('listbox').waitFor({state:'hidden'});
          assert.equal(await form.locator('input[name="playerOfMatchTeamMemberId"]').inputValue(),'player-2');
          await page.setViewportSize({width:width===390?1360:390,height:844});
          assert.equal(await form.locator('input[name="scorerGoals_player-0"]').inputValue(),'2');
          assert.equal(await rating.inputValue(),'9.2');
          await page.setViewportSize({width,height:844});
          const save=form.getByRole('button',{name:'Save match details',exact:true});
          // The retained desktop button is compact; mobile requires a full
          // 44px touch target. Numeric entry controls require 44px at all widths.
          await contained(page,save,width<=640?43:32);
          await save.click(); await page.waitForFunction(()=>window.__submissions.length===1);
          const submission=await page.evaluate(()=>window.__submissions[0]);
          assert.equal(submission.actionName,'saveTeamMatchDetails');
          const fields=Object.fromEntries(submission.fields);
          assert.equal(fields['scorerGoals_player-0'],'2');assert.equal(fields['assists_player-0'],'1');assert.equal(fields['rating_player-0'],'9.2');
          assert.equal(fields.playerOfMatchTeamMemberId,'player-2');assert.equal(fields.teamid,'team-a');assert.equal(fields.resultId,'result-a');
          assert.equal(submission.fields.filter(([key])=>key==='scorerGoals_player-0').length,1);
          assert.equal(submission.fields.filter(([key])=>key==='rating_player-0').length,1);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Horizontal page overflow');
          assert.deepEqual(errors,[]);
          await form.locator('[data-match-player="player-0"]').scrollIntoViewIfNeeded();
          await page.screenshot({path:`${artifacts}/${engine.name()}-${width}.png`});
          if(width===390) {
            const mutation=await page.addStyleTag({content:'[data-match-player-fields]{min-width:640px !important}'});
            await assert.rejects(contained(page,form.locator('[data-match-player="player-0"] input[type="number"]')), /Player controls require horizontal scrolling/);
            await mutation.evaluate(node=>node.remove());
            await rating.fill('9.2');
            await rating.evaluate(node=>node.step='0.5');
            assert.equal(await rating.evaluate(node=>node.checkValidity()),false,'Restoring the old half-point rule must reject 9.2');
            await rating.evaluate(node=>node.step='0.1');
            assert.equal(await rating.evaluate(node=>node.checkValidity()),true);
          }
          console.log(`${engine.name()} ${width}px: 9.2 accepted, invalid ratings blocked, fields, POM, one save payload and resize preserved`);
        } catch(error) {
          await page.screenshot({path:`${artifacts}/${engine.name()}-${width}-failure.png`});
          fs.writeFileSync(`${artifacts}/${engine.name()}-${width}-failure.html`,await page.content());
          fs.writeFileSync(`${artifacts}/${engine.name()}-${width}-failure.txt`,String(error.stack||error));
          throw error;
        } finally { await page.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
