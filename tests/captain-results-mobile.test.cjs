const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const pagePath = 'src/app/captain/team/[teamid]/results/page.tsx';

function fixtureData() {
  const members = Array.from({ length: 12 }, (_, i) => ({ id: `player-${i}`, role: i ? 'PLAYER' : 'CAPTAIN', user: {
    name: i === 1 ? 'A Very Long Synthetic Player Name For Layout Testing' : `Test Player ${i}`,
    email: `${'long-contact-'.repeat(i === 1 ? 5 : 1)}${i}@example.invalid`,
  } }));
  const team = { id: 'team-a', name: 'Test Team A', members };
  const result = { id: 'result-a', homeScore: 3, awayScore: 1, enteredAt: new Date(), overturn: null,
    teamMetadata: [{ teamId: team.id, goalsRecorded: 1, playerOfMatchName: members[0].user.name,
      scorers: [{ teamMemberId: members[0].id, name: members[0].user.name, goals: 1, assists: 0 }] }], disputes: [] };
  const fixture = { id: 'fixture-a', homeTeamId: team.id, awayTeamId: 'team-b', kickoffAt: new Date(),
    homeTeam: { name: team.name }, awayTeam: { name: 'Test Team B' }, result,
    selections: [{ selectionStatus: 'SELECTED', teamMember: members[0] }] };
  return { team, fixture, performances: [{ matchResultId: result.id, teamMemberId: members[0].id, played: true, rating: 7.5 }] };
}

function harness() {
  const data = fixtureData(), writes = [];
  let authorised = true;
  const mocks = {
    '@/lib/prisma': { prisma: {
      team: { findUnique: async () => data.team },
      fixture: { findMany: async () => [data.fixture] },
      matchResult: { findUnique: async () => ({ ...data.fixture.result, fixture: data.fixture }) },
      matchResultTeamMeta: { upsert: async args => { writes.push(args); } },
    } },
    '@/lib/requireCaptain': { requireCaptain: async () => { if (!authorised) throw new Error('Not authorised'); return { user: { id: 'captain' } }; } },
    '@/lib/playerMatchPerformances': { getMatchPerformances: async () => data.performances, replaceMatchPerformances: async args => { writes.push(args); } },
    '@/lib/datetime/london': { formatDateTimeInLondon: () => 'Test match date' },
    '@/lib/fixtures/result-score': { getPredictorResult: result => ({ homeScore: result.homeScore, awayScore: result.awayScore }), RESULT_OVERTURN_SUMMARY_SELECT: {} },
    '@/components/fixtures/OverturnedResultNotice': () => null,
    '@/components/ui/FormListboxField': props => React.createElement('label', {}, props.label, React.createElement('input', { type: 'hidden', name: props.name, value: props.value })),
    'next/cache': { revalidatePath() {} },
    'next/navigation': { notFound() { throw new Error('Not found'); }, redirect(url) { throw Object.assign(new Error('Redirect'), { url }); } },
    '@prisma/client': { ResultDisputeStatus: { OPEN: 'OPEN', REVIEW: 'REVIEW' } },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', code)(id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (id === 'react/jsx-runtime' || id === 'react') return require(id);
      const base = id.startsWith('@/') ? 'src/' + id.slice(2) : path.join(path.dirname(file), id);
      const target = ['.tsx', '.ts'].map(ext => base + ext).find(p => fs.existsSync(p));
      if (target) return load(target);
      throw new Error(`Unexpected dependency ${id}`);
    }, module, module.exports);
    return module.exports;
  }
  return { data, writes, setAuthorised: value => { authorised = value; }, load,
    page: filters => load(pagePath).default({ params: Promise.resolve({ teamid: data.team.id }), searchParams: Promise.resolve(filters || {}) }) };
}
function findForm(node) {
  if (!React.isValidElement(node)) return null;
  if (node.type === 'form' && node.props.action?.name === 'saveTeamMatchDetails') return node;
  for (const child of React.Children.toArray(node.props.children)) { const found = findForm(child); if (found) return found; }
  return null;
}
if (require.main === module) {
  test('full results page renders exactly one set of fields per player, with original defaults', async () => {
    const h = harness(), tree = await h.page(), html = renderToStaticMarkup(tree);
    for (const member of h.data.team.members) for (const name of ['played_', 'scorerGoals_', 'assists_', 'rating_']) {
      assert.equal(html.split(`name="${name}${member.id}"`).length - 1, 1);
    }
    assert.match(html, /Add scorers &amp; match details/);
    assert.match(html, /id="edit-match-result-a"/);
    assert.match(html, /Save match details/);
    assert.match(html, /Player of the Match/);
    assert.match(html, /value="7.5"/);
    assert.doesNotMatch(html, /min-w-\[640px\]/);
    assert.equal(h.writes.length, 0);
  });
  test('the unchanged action accepts scorer, assist, rating and Player of the Match payloads', async () => {
    const h = harness(), form = findForm(await h.page());
    const body = new FormData();
    for (const [key, value] of Object.entries({ teamid: 'team-a', resultId: 'result-a', scorerGoals_player0: 'unused',
      'scorerGoals_player-0': '2', 'assists_player-0': '1', 'rating_player-0': '7.5', playerOfMatchTeamMemberId: 'player-0' })) body.set(key, value);
    await assert.rejects(form.props.action(body), e => e.url?.includes('saved=1'));
    assert.equal(h.writes[0].update.goalsRecorded, 2);
    assert.equal(h.writes[0].update.playerOfMatchName, 'Test Player 0');
    assert.deepEqual(h.writes[1].rows, [{ teamMemberId: 'player-0', rating: 7.5 }]);
    assert.equal(h.data.fixture.result.homeScore, 3);
  });
  test('captain permissions, score bounds and the nine-player limit still reject invalid saves', async () => {
    for (const scenario of ['unauthorised', 'goals', 'assists', 'rating', 'players']) {
      const h = harness(), form = findForm(await h.page()), body = new FormData();
      body.set('teamid', 'team-a'); body.set('resultId', 'result-a');
      if (scenario === 'unauthorised') h.setAuthorised(false);
      if (scenario === 'goals') body.set('scorerGoals_player-0', '4');
      if (scenario === 'assists') body.set('assists_player-0', '4');
      if (scenario === 'rating') body.set('rating_player-0', '7.2');
      if (scenario === 'players') for (let i = 0; i < 10; i++) body.set(`played_player-${i}`, 'on');
      await assert.rejects(form.props.action(body), e => e.message === 'Not authorised' || e.url?.includes('error='));
      assert.equal(h.writes.length, 0, scenario);
    }
  });
  test('empty squads stay disabled and no-results filters remain available', async () => {
    const h = harness(); h.data.team.members = [];
    assert.match(renderToStaticMarkup(await h.page()), /No squad players are available/);
    assert.match(renderToStaticMarkup(await h.page()), /disabled=""/);
    assert.match(renderToStaticMarkup(await h.page({ q: 'no-such-team-or-player' })), /No results matched/);
  });
}
module.exports = { fixtureData, harness };
