const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, renderScreen } = require('./render.cjs');

for (const teamName of ['Dynamo Kebab', 'Harrogate Naija Isolo FC', 'A&B United']) {
  test(`Home renders the saved team name: ${teamName}`, async () => {
    const { html, calls } = await renderScreen({ teamName });
    const escaped = teamName.replaceAll('&', '&amp;');
    assert.ok(html.includes(`<h1>${escaped}</h1>`));
    assert.doesNotMatch(html, /Your team<|The things that need your attention|Quick actions|Open fixture/);
    assert.deepEqual(calls.authorisations, ['demo']);
    assert.equal(calls.identityReads.length, 1);
  });
}
test('identity reads are authorised and never attempted after an access failure', async () => {
  const h = harness({ deny: true });
  const Home = h.load('src/components/captain/CaptainAppHome.tsx').default;
  await assert.rejects(Home({ teamId: 'demo' }), /NOT_AUTHORISED/);
  assert.equal(h.calls.identityReads.length, 0);
});
test('missing team cannot be replaced with a made-up generic identity', async () => {
  await assert.rejects(renderScreen({ missingTeam: true }), /NOT_FOUND/);
});
test('existing balances, incomplete reports, confirmation status and disputes survive the redesign', async () => {
  const { html } = await renderScreen({ data: { paymentDueNowLabel: '£40.00', reportsDue: 10, overdueConfirmations: 2, openIssues: 1 } });
  for (const text of ['£40.00', '10 match reports to finish', 'Confirm 2 fixtures', '1 result issue to review', 'Fixture confirmed']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Reports due|already paid|Paid on time/);
});
test('no fixture and all-zero state do not fabricate urgency', async () => {
  const { html } = await renderScreen({ data: { nextFixture: null, reportsDue: 0 } });
  assert.match(html, /No match scheduled/);
  assert.match(html, /0 match reports to finish/);
  assert.doesNotMatch(html, /Needs attention|Confirm your fixture|result issue/);
});
test('Home has one matchup text node instead of a legacy badge-injection heading', async () => {
  const { html } = await renderScreen();
  assert.match(html, /<p[^>]*data-captain-native-match[^>]*>Timmy Time FC vs Dynamo Kebab<\/p>/);
  assert.doesNotMatch(html, /<h2[^>]*>[^<]* vs /);
  assert.equal((html.match(/Timmy Time FC vs Dynamo Kebab<\/p>/g) || []).length, 1);
});
const cases = [
  ['', 'Home'], ['/', 'Home'], ['/fixtures', 'Fixtures'], ['/fixtures/f/selection', 'Fixtures'],
  ['/squad/member/edit', 'Squad'], ['/captain-squad', 'Squad'], ['/payments', 'Payments'],
  ['/payments/credit-ledger', 'Payments'], ['/player-payments/account/fee', 'Payments'],
  ['/messages', 'Inbox'], ['/chat', 'Inbox'], ['/more', 'More'], ['/availability', 'More'],
  ['/results-history', 'More'], ['/veo-priority', 'More'], ['/rules', 'More'],
];
for (const [route, expected] of cases) test(`exactly one correct active tab for ${route || 'Home'}`, async () => {
  const pathname = '/captain/team/demo' + route;
  const { html } = await renderScreen({ pathname });
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  const nav = html.slice(html.indexOf('<nav aria-label="Captain quick navigation"'));
  assert.match(nav, new RegExp(`aria-current="page" aria-label="${expected}(?:, [^"]*)?"`));
  for (const label of ['Home', 'Fixtures', 'Squad', 'Payments', 'Inbox', 'More']) assert.ok(nav.includes(`>${label}</span>`), label);
});
test('routing never treats another team id as this team or confuses account with accounts', () => {
  const { getCaptainAppSection } = harness().load('src/lib/captain/app-navigation.ts');
  assert.equal(getCaptainAppSection('/captain/team/demo-two/payments', 'demo').tab, null);
  assert.equal(getCaptainAppSection('/captain/team/demo/player-payments/accounts', 'demo').title, 'Player balances');
  assert.equal(getCaptainAppSection('/captain/team/demo/player-payments/account/x', 'demo').title, 'Player account');
});
test('More retains secondary destinations, restores history access and has no design commentary', async () => {
  const { html } = await renderScreen({ more: true, pathname: '/captain/team/demo/more' });
  for (const route of ['availability', 'availability/history', 'results', 'results-history', 'match-fees', 'payments', 'player-pool', 'player-stats', 'kit', 'weeks-unavailable', 'whatsapp', 'tv', 'veo-priority', 'cup-invitations', 'rules', 'guide', 'help']) assert.ok(html.includes(`href="/captain/team/demo/${route}"`), route);
  assert.doesNotMatch(html, /Everything that does not need|permanent bottom tab/);
  for (const match of html.matchAll(/href="([^"]+)"/g)) assert.ok(match[1].startsWith('/captain/team/demo'), match[1]);
});
