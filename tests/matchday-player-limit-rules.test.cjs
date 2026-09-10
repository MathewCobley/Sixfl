const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Execute the owning modules and pages. Auth/database boundaries are isolated;
// no result, payment, captain acceptance or notification service is callable.
const cache = new Map();
const mocks = {
  'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  'next/navigation': { notFound: () => { throw Error('Unexpected missing test team'); } },
  '@/components/referee/RefereeTabs': () => null,
  '@/lib/admin': { requireReferee: async () => ({ user: { id: 'referee', name: 'Test Referee' }, isAdminPreview: false }) },
  '@/lib/requireAdmin': { requireAdmin: async () => ({ user: { id: 'admin' } }) },
  '@/lib/requireCaptain': { requireCaptain: async () => ({ user: { id: 'captain' } }) },
  '@/lib/prisma': { prisma: { team: { findUnique: async () => ({ id: 'test-team', name: 'Test Team', league: { name: 'Test League', season: 'Test', venueName: 'Test Venue' } }) } } },
  '@/lib/captain/onboarding': { CAPTAIN_AGREEMENT_TEXT: 'Existing agreement', CAPTAIN_AGREEMENT_VERSION: '2.0', getCaptainOnboardingStatus: async () => ({ isAgreementAccepted: true, captainAgreementVersion: null, captainAgreementAcceptedAt: null }) },
  '@/lib/datetime/london': { formatDateTimeInLondon: () => 'Test date' },
  '../onboarding/actions': { acceptCaptainAgreementAction: () => { throw Error('No acceptance writes permitted'); } },
};
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const m = { exports: {} }; cache.set(file, m);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', js)(id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith('react')) return require(id);
    if (id.startsWith('@/lib/')) return load('src/' + id.slice(2) + '.ts');
    throw Error('Unexpected dependency: ' + id);
  }, m, m.exports);
  return m.exports;
}
const shared = load('src/lib/matchday-player-limit-rules.ts');
const league = load('src/lib/league-rules.ts');
const match = load('src/lib/match-rules.ts');
const outgoing = load('src/lib/archived-player-limit-rules-v2-3.ts');
const archives = load('src/lib/rules-archive.ts');
const leagueSection = league.leagueRuleSections.find(s => s.title.startsWith('4.'));
const matchSection = match.matchRuleSections.find(s => s.title === 'Players and Substitutes');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plainText = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

test('one shared participation definition in League and Match Rules', () => {
  assert.deepEqual(leagueSection.points, [...shared.MATCHDAY_PLAYER_LIMIT_POINTS, ...shared.MATCHDAY_PLAYER_LIMIT_SANCTION_POINTS]);
  assert.deepEqual(matchSection.points, [...shared.MATCHDAY_PLAYER_LIMIT_POINTS, shared.MATCHDAY_PLAYER_LIMIT_CROSS_REFERENCE]);
  const text = shared.MATCHDAY_PLAYER_LIMIT_POINTS.join(' ');
  for (const wording of ['six players on the pitch at any one time, including the goalkeeper', 'nine different players across the whole fixture', 'including guest players', 'however briefly', 'attends but does not participate', 'leave the venue, become injured', 'before the additional player participates', 'opposing captain or referee alone does not override']) assert.ok(text.includes(wording), wording);
});

test('either breach has a discretionary forfeit, evidence review, response opportunity and both-team outcome', () => {
  const text = shared.MATCHDAY_PLAYER_LIMIT_SANCTION_POINTS.join(' ');
  for (const wording of ['are separate breaches', 'Either breach may result', '3–0 forfeit defeat', 'reasonable opportunity to respond', 'failure to respond does not, by itself, establish a breach', 'Where both teams breach', 'rather than automatically awarding either team a win']) assert.ok(text.includes(wording), wording);
  assert.ok(!/automatic 3–0|will result in.*forfeit/.test(text));
  assert.match(shared.MATCHDAY_PLAYER_LIMIT_CROSS_REFERENCE, /section 4 of the League Rules/);
});

test('matching new document metadata explicitly applies from publication, never to earlier incidents', () => {
  assert.equal(league.LEAGUE_RULES_VERSION, '2.4');
  assert.equal(match.MATCH_RULES_VERSION, 'Version 2.4 — September 2026');
  assert.equal(league.LEAGUE_RULES_EFFECTIVE_DATE, shared.PLAYER_LIMIT_RULES_EFFECTIVE_DATE);
  assert.equal(match.MATCH_RULES_EFFECTIVE_DATE, shared.PLAYER_LIMIT_RULES_EFFECTIVE_DATE);
  assert.equal(league.LEAGUE_RULES_NEXT_REVIEW, match.MATCH_RULES_NEXT_REVIEW);
  assert.match(shared.PLAYER_LIMIT_RULES_EFFECTIVE_DATE, /10 September 2026 \(from publication\)/);
  assert.match(shared.PLAYER_LIMIT_RULES_PUBLICATION_NOTE, /not retrospectively/);
  assert.match(shared.PLAYER_LIMIT_RULES_PUBLICATION_NOTE, /Earlier incidents.*rules in force/);
});

test('outgoing archives are complete frozen v2.3 snapshots, not references to active v2.4', () => {
  assert.equal(outgoing.archivedPlayerLimitRulesV23.length, 2);
  for (const doc of outgoing.archivedPlayerLimitRulesV23) {
    assert.equal(doc.version, '2.3');
    assert.equal(digest(doc.sections), outgoing.archivedPlayerLimitRulesV23Fingerprints[doc.id]);
    assert.equal(archives.archivedRuleDocuments.filter(d => d.id === doc.id).length, 1);
    assert.ok(doc.sections.length >= 16, doc.id + ' includes the whole document');
    const text = JSON.stringify(doc.sections);
    assert.match(text, /Fielding more than six players at any time may result/);
    assert.ok(!text.includes('Either breach may result'));
    assert.ok(!text.includes('Version 2.4'));
  }
  assert.equal(outgoing.archivedPlayerLimitRulesV23[0].effectiveDate, '4 September 2026');
  assert.match(outgoing.archivedPlayerLimitRulesV23[1].effectiveDate, /22 August 2026.*date displayed.*September 2026/);
  for (const id of ['league-rules-1-4', 'match-rules-1-4', 'league-agreement-1-2']) assert.ok(archives.archivedRuleDocuments.some(d => d.id === id));
  assert.match(JSON.stringify(outgoing.archivedPlayerLimitRulesV23[0].sections), /confirmed a fixture and then fails to attend/);
});

if (process.env.PLAYER_LIMIT_PREPARED === '1') test('full prebuild changes no other published rule sections', () => {
  assert.deepEqual(league.leagueRuleSections.filter(s => !s.title.startsWith('4.')), outgoing.archivedPlayerLimitRulesV23[0].sections.filter(s => !s.title.startsWith('4.')));
  assert.deepEqual(match.matchRuleSections.filter(s => s.title !== 'Players and Substitutes'), outgoing.archivedPlayerLimitRulesV23[1].sections.filter(s => s.title !== 'Players and Substitutes'));
});

const pageCases = [
  ['league', 'src/app/(public)/league-rules/page.tsx'],
  ['match', 'src/app/(public)/match-rules/page.tsx'],
  ['referee', 'src/app/(public)/referee/match-rules/page.tsx'],
  ['captain-rules', 'src/app/captain/team/[teamid]/rules/page.tsx'],
  ['captain-guide', 'src/app/captain/team/[teamid]/guide/page.tsx'],
];
for (const [label, file] of pageCases) test('actual ' + label + ' page renders the common limits without the old six-only sanction', async () => {
  const Page = load(file).default;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ teamid: 'test-team' }) }));
  const text = plainText(html);
  for (const point of shared.MATCHDAY_PLAYER_LIMIT_POINTS) assert.ok(text.includes(point), label + ': ' + point);
  assert.ok(!text.includes('Fielding more than six players at any time may result'));
  assert.ok(!text.includes('If a league, venue or referee gives a specific instruction for a fixture, that instruction applies'));
  if (['league', 'match', 'referee'].includes(label)) {
    assert.ok(text.includes(shared.PLAYER_LIMIT_RULES_EFFECTIVE_DATE));
    assert.ok(text.includes(shared.PLAYER_LIMIT_RULES_PUBLICATION_NOTE));
  }
  if (label === 'league') for (const point of shared.MATCHDAY_PLAYER_LIMIT_SANCTION_POINTS) assert.ok(text.includes(point));
  else assert.ok(text.includes(shared.MATCHDAY_PLAYER_LIMIT_CROSS_REFERENCE));
  if (label === 'captain-guide') assert.ok(text.includes('accepted before version tracking'));
  fs.mkdirSync('.tmp/player-limit-rules', { recursive: true });
  fs.writeFileSync('.tmp/player-limit-rules/' + label + '.html', html);
});

test('admin archive renders outgoing v2.3 and current v2.4 with central effective dates', async () => {
  const Page = load('src/app/(admin)/admin/rules-archive/page.tsx').default;
  const html = renderToStaticMarkup(await Page());
  const text = plainText(html);
  assert.ok(text.includes('v2.4')); assert.ok(text.includes('v2.3'));
  assert.ok(text.includes(shared.PLAYER_LIMIT_RULES_EFFECTIVE_DATE));
  assert.ok(text.includes('date displayed; version label said September 2026'));
  assert.ok(text.includes('Fielding more than six players at any time may result'));
  fs.mkdirSync('.tmp/player-limit-rules', { recursive: true });
  fs.writeFileSync('.tmp/player-limit-rules/admin-archive.html', html);
});
