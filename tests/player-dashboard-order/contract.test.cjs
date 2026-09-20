const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const LAYOUT = 'src/app/player/team/[teamid]/layout.tsx';
const TEMPLATE = 'src/app/player/team/[teamid]/template.tsx';
const TEAM = 'example-team';
const root = path.resolve(__dirname, '../..');
const h = React.createElement;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Execute the real layout, template, navigation and overview guard. External
// data panels and page content are synthetic; never query a live account.
function load(file, mocks, source = read(file)) {
  const code = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'fetch', code)(id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    if (id === 'next/link') return ({ children, ...props }) => h('a', props, children);
    throw Error(`Unexpected dependency ${id} in ${file}`);
  }, mod, mod.exports, () => { throw Error('External request forbidden'); });
  return mod.exports;
}

async function renderDashboard({ role = 'PLAYER', route = '', preview = false, layoutSource, templateSource } = {}) {
  const pathname = `/player/team/${TEAM}${route}`;
  const search = new URLSearchParams(preview ? 'previewMembershipId=example-membership' : '');
  const navigation = { usePathname: () => pathname, useSearchParams: () => search, useParams: () => ({ teamid: TEAM }) };
  const only = load('src/components/player/PlayerDashboardOnly.tsx', { 'next/navigation': navigation }).default;
  const icon = props => h('svg', props);
  const nav = load('src/components/player/PlayerTeamNav.tsx', {
    'next/navigation': navigation,
    '@heroicons/react/24/outline': {
      BanknotesIcon: icon,
      CalendarDaysIcon: icon,
      ChartBarSquareIcon: icon,
      HomeIcon: icon,
      PlayCircleIcon: icon,
    },
  }).default;
  const seen = [];
  const panel = (name, title) => props => {
    seen.push({ name, props });
    return h('section', { 'data-order-panel': name, className: 'mx-auto my-6 w-full max-w-6xl rounded-2xl border border-white/20 p-6' },
      h('h2', { className: 'text-2xl font-bold' }, title),
      h('div', { style: { minHeight: '600px' } }, 'Synthetic panel content for layout verification'));
  };
  const actualNews = load('src/components/news/LatestNews.tsx', {
    'next/navigation': navigation,
    './NewsCard': panel('news-card', 'Example published report'),
  }).default;
  const template = load(TEMPLATE, { '@/components/news/LatestNews': actualNews }, templateSource).default;
  const layout = load(LAYOUT, {
    'next-auth': { getServerSession: async () => ({ user: { email: 'example@example.invalid' } }) },
    '@prisma/client': { UserRole: { ADMIN: 'ADMIN' } },
    '@/auth': { authOptions: {} },
    '@/lib/prisma': { prisma: {
      team: {
        findUnique: async () => ({
          name: 'Example United',
          logoUrl: null,
          league: { name: 'Example League', season: '2026' },
        }),
      },
      user: {
        findUnique: async () => ({
          role,
          teamMembers: role === 'CAPTAIN' ? [{ id: 'example-captain' }] : [],
        }),
      },
    } },
    '@/components/player/PlayerTeamNav': nav,
    '@/components/player/PlayerDashboardOnly': only,
    '@/components/goal-of-week/GoalOfWeekDashboardPromo': panel('goals', 'Goal of the Month — current nominees'),
    '@/components/player/PlayerLeagueMediaPanel': panel('media', 'League & form'),
    '@/components/player/PlayerMessageBox': panel('messages', 'Team messages'),
    '@/components/player/PlayerPreviewReturnBanner': {
      __esModule: true,
      default: ({ returnHref, returnLabel, isAdmin }) =>
        h('div', { 'data-player-preview-return': isAdmin ? 'admin' : 'captain' },
          h('a', { href: returnHref }, `← ${returnLabel}`)),
    },
    '@/components/player/PlayerPwaPortalHeader': {
      __esModule: true,
      default: ({ teamName }) =>
        h('section', { 'data-player-pwa-header': true }, 'Player Portal · ', teamName),
    },
  }, layoutSource).default;
  const page = h('main', { 'data-dashboard-core': true, className: 'min-h-screen bg-[#07130f] px-4 py-8 text-white' },
    h('div', { className: 'mx-auto max-w-6xl space-y-8' },
      h('section', { className: 'rounded-3xl border border-emerald-400/20 p-6' },
        h('p', null, preview ? 'Example player preview' : 'Player team area'),
        h('h1', { className: 'text-3xl font-bold' }, route ? 'Example player subpage' : 'Example United'),
        h('p', null, 'Synthetic dashboard data — no live account')),
      h('section', { 'data-core-actions': true }, h('h2', null, 'Your next fixture'),
        h('a', { href: `/player/team/${TEAM}/availability` }, 'Confirm availability'),
        h('a', { href: `/player/team/${TEAM}/ledger`, className: 'ml-4' }, 'Match fees'))));
  const children = h(template, null, page);
  const html = renderToStaticMarkup(await layout({ params: Promise.resolve({ teamid: TEAM }), children }));
  return { html, seen };
}

function assertCoreFirst(html) {
  const core = html.indexOf('data-dashboard-core');
  const coreEnd = html.indexOf('</main>');
  assert.ok(core >= 0 && coreEnd > core);
  for (const marker of ['aria-label="Latest League News"', 'data-order-panel="goals"', 'data-order-panel="media"', 'data-order-panel="messages"']) {
    assert.ok(html.indexOf(marker) > coreEnd, `${marker} must follow the player's core dashboard`);
  }
  assert.equal((html.match(/data-dashboard-core/g) || []).length, 1);
  assert.equal((html.match(/aria-label="Latest League News"/g) || []).length, 1);
  assert.equal((html.match(/data-order-panel="goals"/g) || []).length, 1);
}

for (const role of ['PLAYER', 'ADMIN', 'CAPTAIN']) {
  test(`${role}: the composed player layout and template keep core content before all discovery panels`, async () => {
    const { html, seen } = await renderDashboard({ role, preview: role === 'ADMIN' });
    assertCoreFirst(html);
    assert.ok(html.indexOf('Player team sections') < html.indexOf('data-dashboard-core'));
    assert.equal(html.includes('Return to admin team'), role === 'ADMIN');
    assert.equal(html.includes('Return to captain dashboard'), role === 'CAPTAIN');
    if (role === 'ADMIN') assert.match(html, /availability\?previewMembershipId=example-membership/);
    assert.equal(seen.find(item => item.name === 'goals').props.teamId, TEAM);
  });
}

for (const route of ['/stats', '/availability', '/league-results', '/tv', '/ledger', '/message']) {
  test(`${route}: overview-only content stays absent and the subpage is rendered once`, async () => {
    const { html, seen } = await renderDashboard({ role: 'ADMIN', route, preview: true });
    assert.equal((html.match(/data-dashboard-core/g) || []).length, 1);
    assert.doesNotMatch(html, /aria-label="Latest League News"|data-order-panel/);
    assert.equal(seen.length, 0);
    assert.match(html, /Return to admin team/);
  });
}

test('regression catches each original before-children insertion independently', async () => {
  const layoutSource = read(LAYOUT).replace('      {children}\n', '').replace('      <PlayerDashboardOnly teamId={teamid}>', '      {children}\n      <PlayerDashboardOnly teamId={teamid}>');
  // Move the real children position back below the first promo, as in the bug.
  const brokenLayout = layoutSource.replace('      {children}\n', '').replace('      </PlayerDashboardOnly>', '      </PlayerDashboardOnly>\n      {children}');
  assert.throws(() => assertCoreFirst(''), /assert/);
  const first = await renderDashboard({ layoutSource: brokenLayout });
  assert.throws(() => assertCoreFirst(first.html), /goals.*must follow/);
  const brokenTemplate = read(TEMPLATE).replace('{children}<LatestNews scope="player" />', '<LatestNews scope="player" />{children}');
  assert.notEqual(brokenTemplate, read(TEMPLATE));
  const second = await renderDashboard({ templateSource: brokenTemplate });
  assert.throws(() => assertCoreFirst(second.html), /Latest League News.*must follow/);
});

module.exports = { renderDashboard, assertCoreFirst };
