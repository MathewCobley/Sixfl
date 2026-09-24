// Render the real captain components with inert auth/data and Next navigation.
// No production database, network requests or financial actions are available.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const baseData = {
  teamId: 'demo', leaguePosition: '10th', reportsDue: 10, openIssues: 0,
  paymentDueNowLabel: '£0.00', overdueConfirmations: 0,
  nextFixture: {
    label: 'Timmy Time FC vs Dynamo Kebab', dateLabel: 'Tue, 29 Sept, 20:00',
    venueLabel: 'Rossett Sports Centre', statusLabel: 'Fixture confirmed',
    statusTone: 'emerald', countdownLabel: '5 days to go',
  },
};

function harness(options = {}) {
  const calls = { authorisations: [], identityReads: [] };
  const cache = new Map();
  const styles = new Proxy({}, { get: (_, name) => String(name) });
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = fs.readFileSync(absolute, 'utf8');
    const compiled = ts.transpileModule(source, { fileName: absolute, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, reportDiagnostics: true });
    assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, absolute);
    const module = { exports: {} }; cache.set(absolute, module);
    function dependency(id) {
      if (id.endsWith('.module.css')) return { __esModule: true, default: styles };
      if (id === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
      if (id === 'next/navigation') return {
        usePathname: () => options.pathname || '/captain/team/demo',
        notFound: () => { throw Error('NOT_FOUND'); },
      };
      if (id === '@/lib/requireCaptain') return { requireCaptain: async teamId => {
        calls.authorisations.push(teamId);
        if (options.deny) throw Error('NOT_AUTHORISED');
        return { user: { id: 'inert-test-captain' } };
      } };
      if (id === '@/lib/prisma') return { prisma: { team: { findUnique: async input => {
        calls.identityReads.push(input);
        assert.deepEqual(input, { where: { id: options.teamId || 'demo' }, select: { name: true } });
        return options.missingTeam ? null : { name: options.teamName || 'Dynamo Kebab' };
      } } } };
      if (['react', 'react/jsx-runtime', '@heroicons/react/24/outline'].includes(id)) return require(id);
      if (id.startsWith('@/') || id.startsWith('.')) {
        const target = id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(absolute), id);
        const found = [target, target + '.tsx', target + '.ts'].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
        if (found) return load(found);
      }
      throw Error(`Unmocked captain test dependency: ${id}`);
    }
    new Function('require', 'module', 'exports', 'fetch', compiled.outputText)(dependency, module, module.exports, () => { throw Error('Network disabled'); });
    return module.exports;
  }
  return { load, calls };
}

async function renderScreen(options = {}) {
  const h = harness(options);
  const data = { ...baseData, ...options.data, teamId: options.teamId || 'demo' };
  const Header = h.load('src/components/captain/CaptainAppHeader.tsx').default;
  const Nav = h.load('src/components/captain/CaptainPwaBottomNav.tsx').default;
  const content = options.more
    ? await h.load('src/app/captain/team/[teamid]/more/page.tsx').default({ params: Promise.resolve({ teamid: data.teamId }) })
    : await h.load('src/components/captain/CaptainAppHome.tsx').default(data);
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(Header, { teamId: data.teamId, teamName: options.teamName || 'Dynamo Kebab', teamLogoUrl: null }),
    React.createElement('div', { className: 'captain-team-container' }, React.createElement('main', { className: 'captain-team-main' }, content)),
    React.createElement(Nav, { teamId: data.teamId, squadHref: `/captain/team/${data.teamId}/captain-squad`, unreadMessageCount: options.unread ?? 36 }),
  ));
  return { html, calls: h.calls, data };
}
module.exports = { harness, renderScreen, baseData };
