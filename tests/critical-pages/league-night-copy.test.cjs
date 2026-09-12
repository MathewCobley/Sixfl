const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const sourcePath = 'src/components/home/HomepageLeagueDirectory.tsx';
const source = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  fileName: sourcePath,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;

const fixture = {
  id: 'test-boston-spa', name: 'Boston Spa', slug: 'test-boston-spa',
  homepageStage: 'FORMING', dayOfWeek: null,
  venueName: 'Boston Spa Academy', area: 'Boston Spa', description: null,
  costPerTeamPerMatchPence: 4000, proposedStartDate: null,
  teamCount: 2, targetTeamCount: 12,
};

async function renderLeague(overrides = {}) {
  const mod = { exports: {} };
  const mocks = {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/lib/leagues/homepage-leagues': {
      getHomepageLeagues: async () => [{ ...fixture, ...overrides }],
    },
  };
  new Function('require', 'module', 'exports', source)(key => {
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (key === 'react/jsx-runtime') return require(key);
    throw new Error(`Unexpected homepage league dependency: ${key}`);
  }, mod, mod.exports);
  return renderToStaticMarkup(await mod.exports.default());
}

const expected = {
  FORMING: 'A new SIXFL league is forming at Boston Spa Academy. Full teams and individual players can register now.',
  PLANNED: 'SIXFL is exploring a new league at Boston Spa Academy. Register early interest as a team or individual player.',
  LIVE: '6-a-side football at Boston Spa Academy. View the current league, fixtures, results and table.',
};

for (const dayOfWeek of [null, undefined, '', '   ', 'ANY', ' any ']) {
  for (const homepageStage of Object.keys(expected)) {
    test(`${homepageStage}: unset night ${JSON.stringify(dayOfWeek)} is omitted from the rendered card`, async () => {
      const html = await renderLeague({ dayOfWeek, homepageStage });
      assert.ok(html.includes(expected[homepageStage]));
      assert.doesNotMatch(html, /Night TBC|\bundefined\b|\bnull\b/);
      assert.doesNotMatch(html, /<span\b[^>]*>\s*<\/span>/, 'No empty night badge');
    });
  }
}

for (const night of ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']) {
  test(`${night}: configured night remains in the description and badge`, async () => {
    const day = night.charAt(0) + night.slice(1).toLowerCase();
    for (const homepageStage of Object.keys(expected)) {
      const html = await renderLeague({ dayOfWeek: night, homepageStage });
      const copy = homepageStage === 'LIVE'
        ? `${day} ${expected.LIVE}`
        : expected[homepageStage].replace('a new ', `a new ${day} `).replace('A new ', `A new ${day} `);
      assert.ok(html.includes(copy));
      assert.match(html, new RegExp(`<span\\b[^>]*>${day}</span>`));
    }
  });
}

test('missing venue uses area or league name without adding a night or extra spaces', async () => {
  for (const fields of [{ venueName: null }, { venueName: '  ', area: null }]) {
    const html = await renderLeague(fields);
    assert.ok(html.includes('A new SIXFL league is forming in Boston Spa.'));
    assert.doesNotMatch(html, /Night TBC|A new {2}/);
  }
});

test('saved descriptions, pricing, launch news and registration links are preserved', async () => {
  const html = await renderLeague({ description: '  Join our new local league.  ' });
  assert.ok(html.includes('Join our new local league.'));
  assert.ok(!html.includes(expected.FORMING));
  for (const text of ['£40 / team', 'Momentum is building', 'Launch news',
    '/leagues/test-boston-spa?type=team#register', '/leagues/test-boston-spa?type=player#register']) {
    assert.ok(html.includes(text), text);
  }
  assert.doesNotMatch(html, /Night TBC/);
});
