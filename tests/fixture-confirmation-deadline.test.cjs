const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const PAGE = 'src/app/captain/team/[teamid]/fixtures/page.tsx';
const NOW = Date.parse('2026-09-13T12:00:00Z');
const HOUR = 3600000;
const h = React.createElement;
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}
const unexpectedWrite = () => { throw Error('Live writes and provider calls are forbidden'); };

function loadPage({ hours = 48, status = null, note = null, provisional = false, noFixtures = false, extraFixture = false } = {}) {
  const confirmation = status ? { status, note, confirmedAt: new Date(NOW - HOUR), issueRaisedAt: new Date(NOW - HOUR), lastChasedAt: null } : null;
  const fixture = {
    id: 'example-fixture', homeTeamId: 'example-team', awayTeamId: 'example-opponent',
    homeTeam: { id: 'example-team', name: 'Example FC' }, awayTeam: { id: 'example-opponent', name: 'Example United' },
    kickoffAt: new Date(NOW + hours * HOUR), publishedAt: new Date(NOW - HOUR), status: 'SCHEDULED',
    venue: { name: 'Example venue' }, captainConfirmations: confirmation ? [confirmation] : [],
    sixflTvRecorded: false, sixflTvUrl: null,
  };
  const dates = [];
  const mocks = {
    'next/cache': { revalidatePath: unexpectedWrite },
    'next/link': ({ children, ...props }) => h('a', props, children),
    'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); }, redirect: () => { throw Error('REDIRECT'); } },
    '@prisma/client': { FixtureCaptainConfirmationStatus: { CONFIRMED: 'CONFIRMED', ISSUE_RAISED: 'ISSUE_RAISED' } },
    '@/lib/prisma': { prisma: {
      team: { findUnique: async () => ({ id: 'example-team', name: 'Example FC', leagueId: 'example-league', league: { name: 'Example league', venueName: 'Example venue' } }) },
      fixture: { findUnique: async () => fixture, findMany: async query => query.where.status === 'SCHEDULED' ? (noFixtures ? [] : [fixture, ...(extraFixture ? [{ ...fixture, id: 'other-fixture' }] : [])]) : [] },
      fixtureCaptainConfirmation: { upsert: unexpectedWrite },
    } },
    '@/lib/requireCaptain': { requireCaptain: async () => ({ user: { id: 'example-captain' }, isCaptain: true, accessMode: 'captain' }) },
    '@/lib/teams/kit-colours': { getTeamKitColours: async () => new Map() },
    '@/lib/teams/fixture-placeholders': { fixtureHasPlaceholderTeam: async () => provisional, getFixturePlaceholderTeamIds: async () => new Set(provisional ? ['example-opponent'] : []) },
    '@/lib/fixtures/result-score': { RESULT_OVERTURN_SUMMARY_SELECT: {} },
    '@/lib/datetime/london': { formatDateTimeInLondon: (date, options) => {
      dates.push(date.toISOString());
      return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'Europe/London' }).format(date);
    } },
    '@/components/fixtures/OverturnedResultNotice': () => null,
    '@/components/fixtures/TeamShirt': () => null,
    '@/components/sixfl-tv/SixflTvFixtureBadge': () => null,
  };
  const source = fs.readFileSync(PAGE, 'utf8') + '\nexport { getFixtureConfirmationSummary, getConfirmableFixture, getFriendlyErrorMessage };\n';
  const compiled = ts.transpileModule(source, { fileName: PAGE, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'Date', 'fetch', compiled)(id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    throw Error('Unmocked dependency: ' + id);
  }, mod, mod.exports, Clock, unexpectedWrite);
  return { ...mod.exports, fixture, confirmation, dates };
}
async function render(options) {
  const page = loadPage(options);
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ teamid: 'example-team' }), searchParams: Promise.resolve({}) }));
  // React may insert hydration comment boundaries between text and numbers.
  return { ...page, html, text: html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ') };
}

for (const hours of [96, 73, 72 + 1 / HOUR]) {
  test(`before deadline (${hours} hours): show the actual 72-hour deadline, not an overdue warning`, () => {
    const page = loadPage({ hours });
    const summary = page.getFixtureConfirmationSummary({ confirmation: null, kickoffAt: page.fixture.kickoffAt });
    assert.equal(summary.label, 'Awaiting team response');
    assert.match(summary.helper, /Please confirm by .*72 hours before kick-off/);
    assert.ok(page.dates.includes(new Date(NOW + (hours - 72) * HOUR).toISOString()));
  });
}
for (const hours of [72, 48, 1]) {
  test(`deadline reached (${hours} hours): unanswered confirmation is overdue, but Yes remains available`, async () => {
    const page = await render({ hours });
    const summary = page.getFixtureConfirmationSummary({ confirmation: null, kickoffAt: page.fixture.kickoffAt });
    assert.equal(summary.label, 'Confirmation overdue');
    assert.equal(summary.tone, 'red');
    assert.match(page.text, /Confirm your team at least 72 hours before kick-off/);
    assert.match(page.text, /Confirmation overdue — please confirm immediately/);
    assert.match(page.html, /<button[^>]*data-attendance-fixture="example-fixture"[^>]*>Yes — we can play<\/button>/);
    assert.doesNotMatch(page.html, /<button[^>]*data-attendance-fixture="example-fixture"[^>]*disabled/);
    assert.doesNotMatch(page.html, /name="(?:unavailableReason|note)"/);
    assert.match(page.html, /mailto:hello@sixfl.co.uk/);
  });
}
for (const [status, note, expected] of [
  ['CONFIRMED', null, 'Team confirmed'],
  ['ISSUE_RAISED', 'A fixture detail needs review', 'SIXFL is reviewing your response'],
  ['ISSUE_RAISED', 'Team unavailable: test fixture', 'SIXFL is reviewing your response'],
]) {
  test(`${status}/${note}: recorded responses must not be described as unanswered or overdue`, async () => {
    const page = await render({ status, note });
    assert.ok(page.text.includes(expected));
    assert.doesNotMatch(page.text, /Confirmation overdue|should have confirmed|will continue to receive reminders/);
  });
}
test('before the deadline the native form copy requires confirmation, not permission to wait', async () => {
  const page = await render({ hours: 96 });
  assert.match(page.text, /Please confirm at least 72 hours before kick-off/);
  assert.match(page.text, /whole team cannot play/);
  assert.match(page.html, /data-attendance-fixture="example-fixture"/);
});
test('provisional and missing fixtures do not receive a confirmation demand', async () => {
  for (const options of [{ provisional: true }, { noFixtures: true }]) {
    const page = await render(options);
    assert.doesNotMatch(page.text, /Confirmation overdue|Confirm your team at least/);
    assert.doesNotMatch(page.html, /data-attendance-fixture/);
  }
});
test('other upcoming fixtures use the same overdue status', async () => {
  const page = await render({ extraFixture: true });
  const list = page.text.slice(page.text.indexOf('Other upcoming fixtures'));
  assert.match(list, /Confirmation overdue/);
});
test('existing late-change, kick-off, ownership and provisional server guards are unchanged', async () => {
  const page = loadPage({ hours: 48 });
  await assert.rejects(page.getConfirmableFixture('example-fixture', 'example-team'), /response window closed/);
  await page.getConfirmableFixture('example-fixture', 'example-team', { allowLateConfirmation: true });
  await assert.rejects(page.getConfirmableFixture('example-fixture', 'wrong-team', { allowLateConfirmation: true }), /does not belong/);
  const started = loadPage({ hours: 0 });
  await assert.rejects(started.getConfirmableFixture('example-fixture', 'example-team', { allowLateConfirmation: true }), /not available/);
  const provisional = loadPage({ provisional: true });
  await assert.rejects(provisional.getConfirmableFixture('example-fixture', 'example-team', { allowLateConfirmation: true }), /provisional/);
  await loadPage({ hours: 96 }).getConfirmableFixture('example-fixture', 'example-team');
});
test('restored confirmation box contains no Veo or SIXFL TV Priority controls', () => {
  const source = fs.readFileSync(PAGE, 'utf8');
  assert.match(source, /<form action=\{confirmFixtureAction\}/);
  assert.match(source, /Yes — we can play/);
  assert.match(source, /No — we cannot play/);
  assert.doesNotMatch(source, /CaptainFixtureConfirmation|FixtureVeoConfirmationForm|readFixtureVeoOffer|confirmFixtureWithVeoAction/);
});

test('neither page nor error copy advertises last-minute confirmation as the normal deadline', () => {
  const source = fs.readFileSync(PAGE, 'utf8');
  assert.doesNotMatch(source, /right up until kick-off|confirm yes at any time before kick-off|you can still confirm/i);
  const page = loadPage();
  const message = page.getFriendlyErrorMessage(new Error('Fixture response window closed'));
  assert.match(message, /at least 72 hours before kick-off/);
  assert.match(message, /email hello@sixfl.co.uk immediately/);
});
