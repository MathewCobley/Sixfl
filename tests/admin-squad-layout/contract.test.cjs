const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const PANEL = 'src/components/admin/teams/ManagedSquadInjuryBridge.tsx';
const ROOT = 'src/app/(admin)/admin/layout.tsx';
const ROUTE = 'src/app/(admin)/admin/teams/[id]/squad/layout.tsx';
const noop = () => null;
function load(path, mocks = {}) {
  const source = fs.readFileSync(path, 'utf8');
  const code = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(key => {
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (['react', 'react/jsx-runtime'].includes(key)) return require(key);
    if (key === 'next/navigation') return { useRouter: () => ({ refresh: noop }) };
    if (key === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
    // Context providers are transparent to this shell test, not leaf widgets to omit.
    // The real provider and navigation/transfers are exercised by the footage browser suite.
    if (key === '@/components/admin/sixfl-tv/FootageUploadProvider') return ({ children }) => React.createElement(React.Fragment, null, children);
    if (key.startsWith('@/components/')) return noop;
    throw new Error(`Unmocked dependency: ${key}`);
  }, mod, mod.exports);
  return mod.exports;
}
const panel = load(PANEL);
const member = (id, status) => ({ id, name: `${status} Test Player`, email: `${id}@example.invalid`, role: 'PLAYER', squadStatus: status, squadStatusNote: status === 'INACTIVE' ? 'Historic/former player marked inactive' : null });
async function renderShell(children, wrapPanel = false) {
  const route = load(ROUTE, {
    '@/lib/requireAdmin': { requireAdmin: async () => ({}) },
    '@/components/admin/teams/ManagedSquadInjuryBridge': props => wrapPanel ? React.createElement('div', { id: 'injury-island' }, React.createElement(panel.default, props)) : React.createElement(panel.default, props),
  });
  const content = await route.default({ params: Promise.resolve({ id: 'test-team' }), children });
  const root = load(ROOT, {
    '@prisma/client': { ResultDisputeStatus: { OPEN: 'OPEN', REVIEW: 'REVIEW' } },
    '@/lib/requireAdmin': { requireAdmin: async () => ({ session: { user: {} }, user: {} }) },
    '@/lib/messaging/service': { getAdminInboxSummary: async () => ({ unreadThreads: 0 }) },
    '@/lib/night-board/next-night-issues': { getNextNightBoardIssueSummary: async () => ({ count: 0 }) },
    '@/lib/prisma': { prisma: { resultDispute: { count: async () => 0 } } },
    '@/components/layout/AppHeader': () => React.createElement('header', { 'data-test-header': true, className: 'p-4 border-b border-white/10' }, 'SIXFL Admin'),
    '@/components/admin/AdminSidebar': () => React.createElement('nav', { 'data-test-sidebar': true, className: 'sticky top-6 rounded-2xl border border-white/10 bg-black p-4' }, 'Admin Console'),
    // A restored global mount must be visible to the test, not hidden by a mock.
    '@/components/admin/teams/ManagedSquadInjuryBridge': () => React.createElement('section', { 'data-errant-injury-panel': true }, 'Injuries outside shell'),
  });
  return renderToStaticMarkup(await root.default({ children: content }));
}

test('no page-sized injury panel is mounted outside the admin main column', async () => {
  assert.doesNotMatch(fs.readFileSync(ROOT, 'utf8'), /ManagedSquadInjuryBridge/);
  const html = await renderShell(React.createElement('h1', null, 'Squad console'));
  assert.doesNotMatch(html, /data-errant-injury-panel/);
  assert.equal((html.match(/data-squad-injury-panel/g) || []).length, 1);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
  assert.ok(main.includes('data-admin-squad-console'));
  assert.ok(main.indexOf('Squad console') < main.indexOf('data-squad-injury-panel'));
  assert.doesNotMatch(main, /<details[^>]*\bopen(?:[=\s>])/);
  assert.ok(html.indexOf('data-test-header') < html.indexOf('Squad console'));
});

test('route has its own admin check and explicit team identity', async () => {
  const route = load(ROUTE, { '@/lib/requireAdmin': { requireAdmin: async () => { throw new Error('denied'); } } });
  await assert.rejects(route.default({ params: Promise.resolve({ id: 'test-team' }), children: null }), /denied/);
  assert.match(fs.readFileSync(ROUTE, 'utf8'), /teamId=\{id\}/);
});

test('unused captain compatibility mount is inert and no longer sniffs global routes', () => {
  assert.equal(renderToStaticMarkup(React.createElement(panel.default)), '');
  assert.doesNotMatch(fs.readFileSync(PANEL, 'utf8'), /usePathname|document\.|MutationObserver/);
});

test('current players retain injury controls; inactive and unknown statuses are never Available', () => {
  const html = renderToStaticMarkup(React.createElement(panel.SquadInjuryRows, {
    members: [member('active', 'ACTIVE'), member('injured', 'INJURED'), member('former', 'INACTIVE'), member('unknown', 'UNKNOWN')],
    notes: {}, busy: null, onNote: noop, onUpdate: noop,
  }));
  assert.match(html, /Mark injured/); assert.match(html, /Mark available/);
  const former = html.match(/<li\b[^>]*data-squad-injury-member="former"[\s\S]*?<\/li>/)?.[0] || '';
  assert.ok(former.includes('Inactive')); assert.ok(former.includes('Historic/former'));
  assert.doesNotMatch(former, /<button|<input|Available|Mark injured/);
  assert.match(html, /statuses could not be recognised/);
});

test('existing membership, identity and payment actions remain owned by their original source', () => {
  const source = fs.readFileSync('src/app/(admin)/admin/teams/[id]/squad/page.tsx', 'utf8');
  for (const name of ['addAdminSquadMemberAction', 'grantAdminCaptainAccessAction', 'moveAdminSquadMemberToProspectsAction', 'removeAdminSquadMemberAction', 'updateAdminSquadMemberRoleAction']) assert.ok(source.includes(name), name);
  assert.match(source, /Add existing user/); assert.match(source, /Add to squad/);
  assert.doesNotMatch(fs.readFileSync(PANEL, 'utf8'), /teamMember\.(create|delete|update)|queueNotification|sendEmail|\/payments/);
});

module.exports = { load, renderShell, PANEL };
