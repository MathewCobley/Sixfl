const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ROOT = path.resolve(__dirname, '..');
const NOW = new Date('2026-09-11T00:00:00Z');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [NOW.getTime()])); } static now() { return NOW.getTime(); } }
function loader(mocks = {}, network = async () => { throw Error('External requests forbidden'); }) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(ROOT, file);
    if (!fs.existsSync(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', 'Date', 'fetch', 'process', js)(id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'next/navigation') return { useRouter: () => ({ push() {}, refresh() {} }) };
      if (id.startsWith('@/')) return load('src/' + id.slice(2));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id));
      if (id === '@prisma/client' || id.startsWith('node:') || id.startsWith('react')) return require(id);
      throw Error('Unexpected dependency: ' + id);
    }, module, module.exports, FixedDate, network, { env: { NODE_ENV: 'production', OPENAI_API_KEY: 'ISOLATED_TEST_ONLY' } });
    return module.exports;
  }
  return load;
}
const fixture = (id, extra = {}) => ({ id, status: 'COMPLETED', kickoffAt: new Date('2026-09-08T18:00:00Z'), homeTeam: { id: 'a', name: 'Example Athletic' }, awayTeam: { id: 'b', name: 'Example United' }, result: { homeScore: 2, awayScore: 1, isDisputed: false, disputes: [], teamMetadata: [] }, ...extra });
function harness(fixtures, exceptions = [], placeholderIds = [], extraMocks = {}) {
  const queries = [], load = loader({
    '@/lib/prisma': { prisma: { league: { findFirst: async () => ({ id: 'league', name: 'Example Tuesday', area: 'Example' }) },
      fixture: { findMany: async q => { queries.push(q); return fixtures; } },
      $queryRaw: async q => {
        queries.push(q);
        // Model the tables actually queried. Replacement history exists, but
        // must not enter the blocker set unless production queries it again.
        return exceptions.filter(row => row.reason !== 'replacement' || q.sql.includes('LastMinuteReplacementResolution'));
      } } },
    '@/lib/teams/fixture-placeholders': { getFixturePlaceholderTeamIds: async () => new Set(placeholderIds) },
    ...extraMocks,
  });
  return { facts: load('src/lib/matchweek-reports/facts.ts'), load, queries };
}
// All former safeguards stay intact, except the explicitly corrected blanket
// replacement exclusion. Replacements never bypass another genuine blocker.
function expectedDisposition(f, exceptions, placeholders) {
  const usableName = value => typeof value === 'string' && !value.includes('@') && value.replace(/[\r\n\t]+/g, ' ').trim();
  if (f.status === 'SCHEDULED' || (f.status === 'COMPLETED' && !f.result)) return 'pending';
  if (f.status !== 'COMPLETED') return 'omitted';
  const r = f.result;
  if (f.kickoffAt > NOW || r.isDisputed || r.disputes.length || exceptions.some(e => e.fixtureId === f.id && e.reason !== 'replacement') || placeholders.includes(f.homeTeam.id) || placeholders.includes(f.awayTeam.id) || [f.homeTeam.name, f.awayTeam.name].some(n => n.trim().toUpperCase() === 'TBC')) return 'omitted';
  if (![r.homeScore, r.awayScore].every(n => Number.isInteger(n) && n >= 0 && n <= 99)) return 'omitted';
  if (!usableName(f.homeTeam.name) || !usableName(f.awayTeam.name)) return 'omitted';
  return 'included';
}
test('every genuine blocker remains explained, including when replacement history exists', async () => {
  const rows = [fixture('included'), fixture('scheduled', { status: 'SCHEDULED', result: null }), fixture('scheduled-score', { status: 'SCHEDULED' }),
    fixture('no-result', { result: null }), fixture('cancelled', { status: 'CANCELLED' }), fixture('postponed', { status: 'POSTPONED' }),
    fixture('flagged', { result: { ...fixture('base').result, isDisputed: true } }), fixture('review', { result: { ...fixture('base').result, disputes: [{ id: 'open-dispute' }] } }),
    fixture('tbc', { awayTeam: { id: 'tbc', name: 'TBC' } }), fixture('placeholder', { homeTeam: { id: 'placeholder-id', name: 'Stand-in slot' } }),
    fixture('future', { kickoffAt: new Date('2099-01-01T18:00:00Z') }), fixture('invalid-negative', { result: { ...fixture('base').result, homeScore: -1 } }),
    fixture('invalid-decimal', { result: { ...fixture('base').result, awayScore: 1.5 } }), fixture('invalid-large', { result: { ...fixture('base').result, homeScore: 100 } }),
    fixture('missing-name', { homeTeam: { id: 'no-name', name: '' } }), fixture('unsafe-name', { awayTeam: { id: 'bad-name', name: 'private@example.invalid' } }),
    fixture('abandonment'), fixture('replacement'), fixture('multiple', { result: { ...fixture('base').result, isDisputed: true, disputes: [{ id: 'd' }] } }),
    fixture('pending-and-replaced', { status: 'SCHEDULED', result: null })];
  const exceptions = [{ fixtureId: 'abandonment', reason: 'abandonment' }, { fixtureId: 'replacement', reason: 'replacement' },
    { fixtureId: 'multiple', reason: 'abandonment' }, { fixtureId: 'multiple', reason: 'replacement' }, { fixtureId: 'multiple', reason: 'replacement' }, { fixtureId: 'pending-and-replaced', reason: 'replacement' }];
  // Give every case a resolved replacement too: it must neither exclude a
  // sound result nor let scheduled/disputed/abandoned/invalid matches through.
  exceptions.push(...rows.map(row => ({ fixtureId: row.id, reason: 'replacement' })));
  const placeholders = ['placeholder-id'], h = harness(rows, exceptions, placeholders), source = await h.facts.getReportSource('example', '2026-09-08');
  assert.equal(source.matches.length + source.skippedFixtures.length, rows.length);
  for (const row of rows) {
    const expected = expectedDisposition(row, exceptions, placeholders), skipped = source.skippedFixtures.find(f => f.fixtureId === row.id);
    if (expected === 'included') { assert.equal(skipped, undefined); assert.ok(source.matches.some(f => f.fixtureId === row.id)); }
    else { assert.equal(skipped.disposition, expected); assert.ok(skipped.teamA && skipped.teamB && skipped.reasons.length); assert.equal(skipped.kickoffAt, row.kickoffAt.toISOString()); }
  }
  const byId = id => source.skippedFixtures.find(f => f.fixtureId === id);
  assert.deepEqual(byId('cancelled').reasons.map(r => r.code), ['cancelled']);
  assert.deepEqual(byId('postponed').reasons.map(r => r.code), ['postponed']);
  assert.deepEqual(byId('abandonment').reasons.map(r => r.code), ['abandonment']);
  assert.equal(byId('replacement'), undefined);
  assert.ok(source.matches.some(f => f.fixtureId === 'replacement'));
  assert.deepEqual(byId('pending-and-replaced').reasons.map(r => r.code), ['scheduled']);
  assert.deepEqual(byId('multiple').reasons.map(r => r.code), ['disputed_result', 'unresolved_dispute', 'abandonment']);
  assert.match(byId('scheduled-score').reasons[0].message, /result is saved, but/);
  assert.match(byId('no-result').reasons[0].message, /completed, but no result/);
  assert.equal(source.pendingFixtures, source.skippedFixtures.filter(f => f.disposition === 'pending').length);
  assert.equal(source.omittedFixtures, source.skippedFixtures.filter(f => f.disposition === 'omitted').length);
  assert.doesNotMatch(JSON.stringify(source), /private@example/);
  assert.equal(h.queries[0].where.publishedAt.not, null);
  assert.equal(h.queries[0].where.kickoffAt.gte.toISOString(), '2026-09-07T23:00:00.000Z');
  assert.match(h.queries[1].sql, /'abandonment'::text AS "reason"/); assert.doesNotMatch(h.queries[1].sql, /LastMinuteReplacementResolution/);
  assert.doesNotMatch(h.queries[1].sql, /notes|email|payment|SELECT \*/i);
});
test('admin-only details preserve old article hashes; included facts and counts still invalidate', async () => {
  const h = harness([fixture('included'), fixture('cancelled', { status: 'CANCELLED' })]);
  const source = await h.facts.getReportSource('example', '2026-09-08');
  const { skippedFixtures, ...legacy } = source;
  const legacyHash = createHash('sha256').update(JSON.stringify(legacy)).digest('hex');
  assert.equal(h.facts.sourceHash(source), legacyHash);
  assert.equal(h.facts.sourceHash({ ...source, skippedFixtures: [{ ...skippedFixtures[0], teamA: 'Corrected omitted label' }] }), legacyHash);
  assert.notEqual(h.facts.sourceHash({ ...source, matches: [{ ...source.matches[0], scoreA: 4 }] }), legacyHash);
  assert.notEqual(h.facts.sourceHash({ ...source, omittedFixtures: 0 }), legacyHash);
});
test('provider gets included facts/counts only, never omitted identities or administrative reasons', async () => {
  const h = harness([fixture('included'), fixture('PRIVATE_OMITTED', { homeTeam: { id: 'private', name: 'Only for admin' } })], [{ fixtureId: 'PRIVATE_OMITTED', reason: 'abandonment' }]);
  const source = await h.facts.getReportSource('example', '2026-09-08');
  let calls = 0;
  const load = loader({}, async (url, options) => {
    calls++; const input = JSON.parse(JSON.parse(options.body).input);
    assert.equal(input.omittedFixtures, 1); assert.equal(input.matches.length, 1);
    assert.doesNotMatch(JSON.stringify(input), /PRIVATE_OMITTED|Only for admin|skippedFixtures|abandonment|editorial review/);
    const content = { title: 'Example Athletic win', introduction: 'One included result.', matches: [{ fixtureId: 'included', paragraph: 'Example Athletic beat Example United 2–1.' }], closing: '' };
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(content) }] }] }));
  });
  await load('src/lib/matchweek-reports/openai.ts').writeOpenAiReport(source); assert.equal(calls, 1);
});
test('owning editor shows current omissions without generation, including with an old saved draft', async () => {
  const h = harness([fixture('included'), fixture('cancelled', { status: 'CANCELLED', homeTeam: { id: 'c', name: 'Example Rovers' } }), fixture('replacement', { status: 'POSTPONED', homeTeam: { id: 'r', name: 'Example City' } })], [{ fixtureId: 'replacement', reason: 'replacement' }]);
  const source = await h.facts.getReportSource('example', '2026-09-08');
  const view = { source, sourceHash: h.facts.sourceHash(source), draft: null, configured: true, model: 'test-model', stale: false, generating: false, latestError: null };
  const Editor = h.load('src/components/admin/matchweek-reports/ReportEditor.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Editor, { slug: 'example', initialView: view }));
  assert.match(html, /Matches not included \(2\)/); assert.match(html, /Example Rovers/); assert.match(html, /Example City/);
  assert.match(html, /marked cancelled/); assert.match(html, /marked postponed/); assert.match(html, /19:00/);
  assert.match(html, /\/admin\/fixtures\/replacement\/edit/); assert.match(html, /target="_blank"/);
  assert.doesNotMatch(html, /postponed, cancelled, disputed, placeholder/);
  const oldSource = { ...source, skippedFixtures: [{ ...source.skippedFixtures[0], teamA: 'STALE OMITTED LABEL' }] };
  const content = { title: 'Saved article', introduction: 'Do not overwrite this draft.', matches: [{ fixtureId: 'included', paragraph: 'An existing saved paragraph.' }], closing: '' };
  const savedView = { ...view, draft: { id: 'draft', version: 1, source: oldSource, sourceHash: view.sourceHash, content, model: 'test', updatedAt: '2026-09-08T20:00:00Z' } };
  const savedHtml = renderToStaticMarkup(React.createElement(Editor, { slug: 'example', initialView: savedView }));
  assert.match(savedHtml, /Example City/); assert.match(savedHtml, /Saved article/); assert.doesNotMatch(savedHtml, /STALE OMITTED LABEL/);
  const target = path.join(ROOT, '.tmp/report-omissions'); fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'view.json'), JSON.stringify(view)); fs.writeFileSync(path.join(target, 'saved-view.json'), JSON.stringify(savedView)); fs.writeFileSync(path.join(target, 'editor.html'), html);
});
test('empty, pending-only and legacy snapshots render accurately, with no crash or hidden details', async () => {
  const h = harness([]), source = await h.facts.getReportSource('example', '2026-09-08');
  const Panel = h.load('src/components/admin/matchweek-reports/ReportSkippedFixtures.tsx').default;
  const render = source => renderToStaticMarkup(React.createElement(Panel, { source }));
  assert.equal(render(source), '');
  assert.match(render({ ...source, pendingFixtures: 1, skippedFixtures: undefined }), /Check saved status/);
  const pending = await harness([fixture('pending', { status: 'SCHEDULED', result: null })]).facts.getReportSource('example', '2026-09-08');
  assert.match(render(pending), /Matches not included \(1\)/); assert.match(render(pending), /still marked scheduled/);
  assert.match(render({ ...pending, skippedFixtures: pending.skippedFixtures.map(f => ({ ...f, teamA: '<script>alert(1)</script>' })) }), /&lt;script&gt;/);
});

// Scores and names here are synthetic; they do not assert live Harrogate results.
test('two completed replacement games join four results using current teams and scores without rewriting the old draft', async () => {
  const ordinary = Array.from({ length: 4 }, (_, i) => fixture(`normal-${i}`));
  const currentGames = ['early', 'late'].map((slot, i) => fixture(`replacement-${slot}`, {
    homeTeam: { id: `opponent-${slot}`, name: `Example ${slot} opponent` },
    awayTeam: { id: 'stand-in', name: 'Example Stand-ins' },
    result: { homeScore: i + 1, awayScore: i + 2, isDisputed: false, disputes: [], teamMetadata: [
      { teamId: 'stand-in', scorers: [{ name: 'Recorded player', goals: 1 }], playerOfMatchName: 'Recorded player' },
      { teamId: 'dropped', scorers: [{ name: 'DO_NOT_REPORT_DROPPED_PLAYER', goals: 1 }], playerOfMatchName: 'DO_NOT_REPORT_DROPPED_PLAYER' },
    ] },
  }));
  const history = currentGames.map(f => ({ fixtureId: f.id, reason: 'replacement', droppedTeamId: 'DO_NOT_REPORT_DROPPED_TEAM' }));
  const originalRows = structuredClone([...ordinary, ...currentGames]), originalHistory = structuredClone(history);
  let stored, reads = 0;
  const h = harness([...ordinary, ...currentGames], history, [], {
    '@/lib/requireAdmin': { requireAdmin: async () => ({ user: { id: 'test-admin' } }) },
    './store': { readStoredReport: async () => { reads++; return stored; } },
  });
  const source = await h.facts.getReportSource('example', '2026-09-08');
  assert.equal(source.matches.length, 6);
  assert.equal(source.omittedFixtures, 0); assert.equal(source.pendingFixtures, 0); assert.deepEqual(source.skippedFixtures, []);
  for (const f of currentGames) {
    const match = source.matches.find(m => m.fixtureId === f.id);
    assert.equal(match.teamA, f.homeTeam.name); assert.equal(match.teamB, f.awayTeam.name);
    assert.equal(match.scoreA, f.result.homeScore); assert.equal(match.scoreB, f.result.awayScore);
    assert.deepEqual(match.scorers, [{ team: 'Example Stand-ins', name: 'Recorded player', goals: 1 }]);
    assert.deepEqual(match.playersOfMatch, [{ team: 'Example Stand-ins', name: 'Recorded player' }]);
  }
  assert.doesNotMatch(JSON.stringify(source), /DO_NOT_REPORT/);
  assert.deepEqual([...ordinary, ...currentGames], originalRows); assert.deepEqual(history, originalHistory);
  const oldSource = { ...source, matches: source.matches.slice(0, 4), omittedFixtures: 2,
    warnings: ['2 fixture(s) omitted: postponed, cancelled, disputed, placeholder, abandonment, replacement or invalid result. Review these separately.'],
    skippedFixtures: currentGames.map(f => ({ fixtureId: f.id, teamA: f.homeTeam.name, teamB: f.awayTeam.name, kickoffAt: f.kickoffAt.toISOString(), disposition: 'omitted', reasons: [{ code: 'replacement', message: 'A last-minute replacement is recorded for this fixture; it needs editorial review before inclusion.' }] })),
  };
  const content = { title: 'Previously saved four-match draft', introduction: 'Keep my original text.', matches: oldSource.matches.map((f, i) => ({ fixtureId: f.fixtureId, paragraph: `Saved paragraph ${i + 1}.` })), closing: '' };
  const draft = { id: 'saved-draft', version: 2, source: oldSource, sourceHash: h.facts.sourceHash(oldSource), content, model: 'test', updatedAt: '2026-09-08T22:00:00Z' };
  stored = { draft, generating: false, latestError: null };
  const view = await h.load('src/lib/matchweek-reports/service.ts').getReportView('example', '2026-09-08');
  assert.equal(reads, 1); assert.equal(view.source.matches.length, 6); assert.equal(view.stale, true);
  assert.strictEqual(view.draft, draft); assert.equal(view.draft.version, 2); assert.strictEqual(view.draft.content, content);
  let providerCalls = 0;
  const write = loader({}, async (url, options) => {
    providerCalls++; const input = JSON.parse(JSON.parse(options.body).input);
    assert.equal(input.matches.length, 6); assert.deepEqual(input.matches, source.matches);
    assert.doesNotMatch(JSON.stringify(input), /DO_NOT_REPORT|skippedFixtures|replacementTeamId|droppedTeamId/);
    const generated = { title: 'Six-match draft', introduction: 'The included games.', matches: input.matches.map((f, i) => ({ fixtureId: f.fixtureId, paragraph: `Match ${i + 1}: ${f.teamA} ${f.scoreA}–${f.scoreB} ${f.teamB}.` })), closing: '' };
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(generated) }] }] }));
  });
  await write('src/lib/matchweek-reports/openai.ts').writeOpenAiReport(source); assert.equal(providerCalls, 1);
  const target = path.join(ROOT, '.tmp/report-omissions'); fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'replacement-views.json'), JSON.stringify({ before: { ...view, source: oldSource, sourceHash: draft.sourceHash, stale: false }, after: view }));
});
