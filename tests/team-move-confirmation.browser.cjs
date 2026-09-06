const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require(process.env.TEAM_MOVE_PLAYWRIGHT_MODULE || 'playwright');
let browser, bundle;
const root = path.resolve(__dirname, '..');
test.before(async () => {
  const built = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Select from '@/components/admin/teams/TeamMoveConfirmationSelect';
      const root=createRoot(document.getElementById('root')); let version=0;
      window.renderMove=(status='PENDING')=>root.render(React.createElement(Select,{enabled:true,key:++version,teamId:'team-one',teamName:'Example FC',initialStatus:status})); window.renderMove();`,
      resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'offline-action', setup(api) {
      api.onResolve({ filter: /move-confirmation-actions$/ }, () => ({ path: 'action', namespace: 'test' }));
      api.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const saveTeamMoveConfirmation = input => window.saveMove(input);' }));
      api.onResolve({ filter: /^@\// }, args => ({ path: path.join(root, 'src', args.path.slice(2) + (args.path.includes('TeamMoveConfirmationSelect') ? '.tsx' : '.ts')) }));
    } }],
  });
  bundle = built.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
for (const width of [1440, 390]) {
  test(`move dropdown saves, reports failures and retains server values at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    try {
      await page.setContent('<!doctype html><style>*{box-sizing:border-box}body{background:#07110d;color:white;font:16px Arial;padding:16px;margin:0}#root{width:100%;max-width:384px}select{display:block;width:100%;min-width:0;padding:10px;background:#0b1411;color:white}</style><h1>Team move tracker test</h1><div id="root"></div>');
      await page.evaluate(() => { window.calls=[]; window.saveMove=input=>{window.calls.push(input);return new Promise(resolve=>window.resolveSave=resolve);}; });
      await page.addScriptTag({ content: bundle });
      const select = page.getByRole('combobox', { name: 'Move confirmation for Example FC' });
      await select.waitFor();
      assert.equal(await select.inputValue(), 'PENDING');
      assert.equal(await page.locator('option').count(), 3);
      await select.selectOption('CONFIRMED');
      assert.equal(await select.isDisabled(), true);
      assert.equal(await page.getByRole('status').textContent(), 'Saving…');
      assert.deepEqual(await page.evaluate(() => window.calls), [{ teamId:'team-one',status:'CONFIRMED',previousStatus:'PENDING' }]);
      await page.evaluate(() => window.resolveSave({ok:true,status:'CONFIRMED',updatedAt:'2026-09-06T12:30:00Z',updatedBy:'Test admin'}));
      await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
      assert.equal(await select.inputValue(), 'CONFIRMED');
      await select.selectOption('DECLINED');
      await page.evaluate(() => window.resolveSave({ok:false,error:'Could not save. Try again.'}));
      await page.getByRole('alert').waitFor();
      assert.equal(await select.inputValue(), 'CONFIRMED');
      assert.equal(await select.isEnabled(), true);
      await select.selectOption('DECLINED');
      await page.evaluate(() => window.resolveSave({ok:true,status:'DECLINED',updatedAt:'2026-09-06T12:31:00Z',updatedBy:'Test admin'}));
      await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
      assert.equal(await select.inputValue(), 'DECLINED');
      await page.evaluate(() => window.renderMove('DECLINED'));
      await select.waitFor();
      assert.equal(await select.inputValue(), 'DECLINED');
      assert.equal(await page.evaluate(() => window.calls.length), 3);
      const bounds=await select.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    } finally { await context.close(); }
  });
}
