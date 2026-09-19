const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const React = require('react');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const { load, renderShell, PANEL } = require('./contract.test.cjs');

(async () => {
  const out = 'artifacts/admin-squad-layout'; fs.mkdirSync(out, { recursive: true });
  const noop = async () => {};
  const page = load('src/app/(admin)/admin/teams/[id]/squad/page.tsx', {
    'next/navigation': { notFound: () => { throw Error('Unexpected not found'); } },
    '@prisma/client': { Prisma: { join: value => value }, TeamRole: {} },
    '@/lib/requireAdmin': { requireAdmin: async () => ({}) },
    '@/lib/datetime/london': { formatDateTimeInLondon: () => '12/09/2026, 12:00' },
    '@/lib/admin/squadLoginStatus': { getSquadLoginStatusMap: async () => new Map() },
    '@/lib/admin/squadMemberCreationDetails': { getSquadMemberCreationDetailsMap: async () => new Map() },
    '@/lib/teamMemberProfiles': { getTeamMemberProfilesByTeamMemberIds: async () => new Map([
      ['active', { squadNumber: 7 }],
      ['injured', { squadNumber: 12 }],
    ]) },
    '@/lib/players/player-team-memberships': { getPlayerTeamMembershipsByUserId: async () => new Map() },
    '@/lib/prisma': { prisma: {
      team: { findUnique: async () => ({ id: 'test-team', name: 'Example United', teamMode: 'STANDARD', isRecruiting: true, contactName: 'Example Captain', contactEmail: 'captain@example.invalid', league: { id: 'test-league', name: 'Example League', season: '2026' }, members: [
        { id: 'active', role: 'PLAYER', createdAt: new Date(), user: { id: 'active-user', name: 'Example Active Player', email: 'active@example.invalid' } },
        { id: 'injured', role: 'PLAYER', createdAt: new Date(), user: { id: 'injured-user', name: 'Example Injured Player', email: 'injured@example.invalid' } },
      ] }) },
      $queryRaw: async () => [],
    } },
    './actions': { addAdminSquadMemberAction: noop, grantAdminCaptainAccessAction: noop, moveAdminSquadMemberToProspectsAction: noop, removeAdminSquadMemberAction: noop, updateAdminSquadMemberRoleAction: noop },
    '@/components/ui/FormListboxField': props => React.createElement('label', { className: 'block min-w-0 text-sm' }, props.label || 'Role', React.createElement('button', { type: 'button', className: 'min-h-11 w-full min-w-0 rounded-xl border border-white/20 px-3 text-left' }, props.value)),
    '@/components/admin/teams/AdminSendPlayerLoginButton': () => React.createElement('button', { type: 'button', className: 'min-h-11 rounded-xl border border-white/20 p-2' }, 'Send sign-in link'),
  });
  const body = await page.default({ params: Promise.resolve({ id: 'test-team' }), searchParams: Promise.resolve({}) });
  const shell = await renderShell(body, true);
  const cssFiles = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith('.css')) cssFiles.push(full); } }
  walk('.next/static');
  const css = cssFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  await build({ stdin: { contents: `import React from 'react'; import { hydrateRoot } from 'react-dom/client'; import Panel from './${PANEL}'; hydrateRoot(document.getElementById('injury-island'), React.createElement(Panel, {teamId:'test-team'}));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: `${out}/island.js`, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'isolated-navigation', setup(b) { b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'isolated' })); b.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export function useRouter(){return {refresh(){window.__refreshCount=(window.__refreshCount||0)+1}}}', loader: 'js' })); } }] });
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${shell}<script src="/island.js"></script></body></html>`;
  fs.writeFileSync(`${out}/console.html`, html);
  const server = http.createServer((req, res) => {
    if (req.url === '/island.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(`${out}/island.js`)); }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
    res.statusCode = 404; res.end('Not found');
  });
  await new Promise(resolve => server.listen(3217, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const tab = await context.newPage(); let reads = 0; const writes = []; let failSave = true;
      const members = [
        { id: 'active', name: 'Example Active Player', email: 'long-email-for-mobile-layout-check@example.invalid', role: 'PLAYER', squadStatus: 'ACTIVE', squadStatusNote: null },
        { id: 'injured', name: 'Example Injured Player', email: 'injured@example.invalid', role: 'PLAYER', squadStatus: 'INJURED', squadStatusNote: 'Ankle' },
        { id: 'former', name: 'Example Former Player', email: 'former@example.invalid', role: 'PLAYER', squadStatus: 'INACTIVE', squadStatusNote: 'Historic/former player marked inactive' },
      ];
      await tab.route('**/api/admin/managed-squad-status**', async route => {
        if (route.request().method() === 'GET') { reads++; return route.fulfill({ json: { members } }); }
        const data = route.request().postDataJSON(); writes.push(data);
        return route.fulfill({ status: failSave ? 500 : 200, json: failSave ? { error: 'Test save failure' } : { ok: true, squadStatus: data.squadStatus } });
      });
      await tab.goto('http://127.0.0.1:3217/');
      await tab.locator('h1').waitFor();
      const panel = tab.locator('[data-squad-injury-panel]');
      assert.equal(await panel.getAttribute('open'), null);
      assert.equal(reads, 0); assert.equal(writes.length, 0);
      assert.ok(await tab.getByRole('button', { name: 'Add to squad', exact: true }).count());
      assert.equal(await tab.getByRole('link', { name: 'Add existing player', exact: true }).getAttribute('href'), '#add-squad-member');
      async function bounds(label) {
        const values = await tab.evaluate(() => {
          const main = document.querySelector('main').getBoundingClientRect();
          const panel = document.querySelector('[data-squad-injury-panel]').getBoundingClientRect();
          const aside = document.querySelector('aside').getBoundingClientRect();
          return { viewport: innerWidth, scroll: document.documentElement.scrollWidth, main: { x: main.x, right: main.right }, panel: { x: panel.x, right: panel.right }, aside: { width: aside.width, right: aside.right } };
        });
        fs.writeFileSync(`${out}/bounds-${width}-${label}.json`, JSON.stringify(values, null, 2));
        assert.ok(values.scroll <= values.viewport + 1, `${width} ${label}: horizontal overflow ${JSON.stringify(values)}`);
        assert.ok(values.panel.x >= values.main.x - 1 && values.panel.right <= values.main.right + 1, 'Injury panel is contained in main');
        if (values.aside.width) assert.ok(values.main.x >= values.aside.right, 'Sidebar cannot overlap main');
      }
      await bounds('closed');
      await tab.screenshot({ path: `${out}/console-${width}.png`, fullPage: true });
      await panel.locator('summary').first().click();
      const active = tab.locator('[data-squad-injury-member="active"]');
      await active.getByRole('button', { name: 'Mark injured', exact: true }).waitFor();
      assert.equal(writes.length, 0);
      await panel.locator('[data-inactive-squad-history] summary').click();
      const former = tab.locator('[data-squad-injury-member="former"]');
      assert.equal(await former.locator('button,input').count(), 0);
      assert.ok((await former.innerText()).includes('Inactive'));
      await active.getByRole('textbox').fill('Test injury note');
      await active.getByRole('button').click();
      await tab.getByRole('alert').filter({ hasText: 'Test save failure' }).waitFor();
      assert.equal(await active.getByRole('textbox').inputValue(), 'Test injury note');
      assert.ok((await active.innerText()).includes('Available'));
      failSave = false;
      await active.getByRole('button').click();
      await active.getByRole('button', { name: 'Mark available', exact: true }).waitFor();
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[1], { teamId: 'test-team', membershipId: 'active', squadStatus: 'INJURED', note: 'Test injury note' });
      await bounds('expanded');
      await tab.screenshot({ path: `${out}/injury-expanded-${width}.png`, fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
