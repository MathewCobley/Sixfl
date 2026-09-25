const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./load.cjs');
process.env.NEXTAUTH_SECRET = 'catterick-synthetic-test-secret-only';
process.env.NEXT_PUBLIC_SITE_URL = 'https://sixfl.example.invalid';
const migrationPath = 'prisma/migrations/20260926001000_catterick_team_interest_campaign/migration.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const campaignBody = migration.match(/\$body\$([\s\S]*?)\$body\$/)?.[1];
const central = harness({}).load('src/lib/leads/teamPlaceConfirmation.ts');
const token = central.createTeamPlaceConfirmationToken('synthetic-lead');
const canonicalPath = `/team-confirmation/${encodeURIComponent(token)}`;
const campaignForm = () => {
  const form = new FormData();
  for (const [k, v] of Object.entries({
    templateId: 'catterick-team-interest-october-2026', templateKey: 'catterick-team-interest-october-2026',
    subject: 'Catterick starts 5 October — is your team joining us?', body: campaignBody,
    ctaLabel: 'Choose team or individual player', ctaUrlKey: 'teamConfirmationUrl',
    selectedType: 'TEAM', selectedStatus: 'CONTACTED', selectedArea: 'Richmond', selectedLeagueId: 'catterick-test',
  })) form.set(k, v);
  return form;
};

test('campaign is in normal EmailTemplate only, manual and replay-safe', () => {
  assert.match(migration, /INSERT INTO "EmailTemplate"/);
  assert.doesNotMatch(migration, /INSERT INTO "NotificationTemplate"|INSERT INTO "NotificationDispatch"|UPDATE "InterestLead"/);
  assert.match(migration, /ON CONFLICT \("key"\) DO NOTHING/);
  assert.match(migration, /'LEAD', 'TEAM'/);
  assert.match(campaignBody, /registered an interest[\s\S]*as a team/);
  assert.match(campaignBody, /Monday 5 October/);
  assert.match(campaignBody, /individual-player option/);
  assert.match(migration, /'teamConfirmationUrl'/);
  assert.equal((campaignBody.match(/{{cta}}/g) || []).length, 1);
});

test('actual renderer personalises copy and builds a recipient-specific signed button', () => {
  const h = harness({});
  const { resolveTemplateText } = h.load('src/lib/email/template-context.ts');
  const { buildSIXFLEmailHtml } = h.load('src/lib/email/buildEmail.ts');
  const body = resolveTemplateText(campaignBody, { firstName: 'Alex', cta: '{{cta}}' });
  const url = central.getTeamPlaceConfirmationUrl('synthetic-lead');
  assert.equal(central.verifyTeamPlaceConfirmationToken(token), 'synthetic-lead');
  assert.equal(central.verifyTeamPlaceConfirmationToken(token + 'x'), null);
  assert.equal(central.verifyTeamPlaceConfirmationToken('different.' + token.split('.')[1]), null);
  const html = buildSIXFLEmailHtml({ body, cta: { label: 'Choose team or individual player', url } });
  assert.match(html, /Hi Alex/);
  assert.ok(html.includes(url));
  assert.match(html, /Choose team or individual player/);
  assert.doesNotMatch(html, /{{firstName}}|{{cta}}/);
  fs.mkdirSync('artifacts/catterick-interest', { recursive: true });
  fs.writeFileSync('artifacts/catterick-interest/email-preview.html', html);
});

function bulkHarness(count) {
  const calls = [];
  const leads = Array.from({ length: count }, (_, i) => ({ id: `lead-${i}` }));
  const h = harness({ interestLead: { findMany: async input => { calls.push(['query', input]); return leads; } } }, {
    '@/lib/requireAdmin': { requireAdmin: async () => { calls.push(['auth']); } },
    '@/lib/expansion-leads': { EXPANSION_LEAD_SOURCE: 'EXPANSION' },
    [path.resolve('src/app/(admin)/admin/leads/actions')]: {
      sendBulkLeadEmailAction: async () => { throw Error('Wrong generic send path'); },
      sendBulkLeadSmsAction: async () => { throw Error('SMS must not be sent'); },
    },
    [path.resolve('src/app/(admin)/admin/leads/team-confirmation-bulk-action')]: {
      sendBulkTeamPlaceConfirmationEmailAction: async (_, form) => { calls.push(['send', form]); return { ok: true, sentCount: count }; },
    },
  });
  return { calls, send: h.load('src/app/(admin)/admin/leads/guarded-bulk-actions.ts').sendBulkLeadEmailAction };
}

test('25-lead campaign still needs explicit bulk-send confirmation', async () => {
  const h = bulkHarness(25);
  const result = await h.send({}, campaignForm());
  assert.equal(result.ok, false);
  assert.match(result.error, /SEND 25 EMAILS/);
  assert.equal(h.calls.filter(c => c[0] === 'send').length, 0);
});
test('campaign dispatch uses team decision wiring, the exact matched IDs and the chosen copy', async () => {
  const h = bulkHarness(25); const form = campaignForm(); form.set('bulkSendConfirmation', 'SEND 25 EMAILS');
  assert.equal((await h.send({}, form)).ok, true);
  const query = h.calls.find(c => c[0] === 'query')[1];
  assert.equal(query.where.interestType, 'TEAM'); assert.equal(query.where.area, 'Richmond');
  const sent = h.calls.find(c => c[0] === 'send')[1];
  assert.equal(sent.get('body'), campaignBody);
  assert.equal(sent.get('ctaLabel'), 'Choose team or individual player');
  assert.deepEqual(sent.getAll('includedLeadIds'), Array.from({ length: 25 }, (_, i) => `lead-${i}`));
});
test('no matched leads cannot fall through to a send-to-everyone operation', async () => {
  const h = bulkHarness(0); assert.equal((await h.send({}, campaignForm())).ok, false);
  assert.equal(h.calls.filter(c => c[0] === 'send').length, 0);
});

const baseLead = { id: 'synthetic-lead', interestType: 'TEAM', status: 'CONTACTED', convertedAt: null, convertedTeamId: null,
  contactName: 'Alex Example', teamName: null, area: 'Richmond', league: null };
async function pageHtml(file, changes = {}, confirmation = null, sp = {}) {
  let reads = 0;
  const db = {
    interestLead: { findUnique: async () => { reads++; return changes === null ? null : { ...baseLead, ...changes }; } },
    $queryRaw: async () => confirmation ? [confirmation] : [],
    $executeRaw: async () => { throw Error('GET cannot write'); },
    $transaction: async () => { throw Error('GET cannot transact'); },
  };
  const Page = harness(db).load(file).default;
  const element = await Page({ params: Promise.resolve({ token }), searchParams: Promise.resolve(sp) });
  return { html: renderToStaticMarkup(element), reads };
}
const teamPage = 'src/app/(public)/team-confirmation/[token]/page.tsx';
const playerPage = 'src/app/(public)/team-confirmation/[token]/player/page.tsx';
test('shared team form retains yes/no/team-name flows and adds a read-only player option', async () => {
  const { html } = await pageHtml(teamPage);
  for (const text of ['YES — I WANT TO ENTER A TEAM', 'No —', 'name="teamName"', 'name="squadSize"', 'Individual-player option']) assert.ok(html.includes(text), text);
  assert.ok(html.includes(`${canonicalPath}/player`));
  assert.doesNotMatch(html, /name="email"|name="phone"/);
});
test('player option asks for explicit confirmation and no repeated contact data', async () => {
  const { html } = await pageHtml(playerPage);
  assert.match(html, /name="confirmPlayerInterest"/);
  assert.match(html, /value="yes"/);
  assert.match(html, /name="token"/);
  assert.doesNotMatch(html, /name="email"|name="phone"/);
  assert.match(html, /does not create a player account/);
  fs.mkdirSync('artifacts/catterick-interest', { recursive: true });
  fs.writeFileSync('artifacts/catterick-interest/player-choice.html', html);
});
for (const changes of [{ status: 'CLOSED' }, { status: 'QUALIFIED' }, { convertedAt: new Date() }, { convertedTeamId: 'team-existing' }, { interestType: 'REFEREE' }]) {
  test(`processed enquiries do not offer player conversion: ${JSON.stringify(changes)}`, async () => {
    const { html } = await pageHtml(playerPage, changes);
    assert.doesNotMatch(html, /name="confirmPlayerInterest"/);
  });
}
test('a saved player decision, not a query flag, controls the success state', async () => {
  const { html } = await pageHtml(playerPage, { interestType: 'PLAYER' }, { status: 'DECLINED' });
  assert.match(html, /Your player interest is recorded/); assert.doesNotMatch(html, /<form/);
  const pending = await pageHtml(playerPage, {}, null, { saved: '1', confirmed: '1' });
  assert.match(pending.html, /name="confirmPlayerInterest"/);
  await assert.rejects(pageHtml(teamPage, { interestType: 'PLAYER' }), error => error.location === `${canonicalPath}/player`);
});
test('action requires an intentional submit before invoking the signed choice service', async () => {
  let writes = 0;
  const h = harness({}, { '@/lib/leads/team-lead-player-choice': {
    recordIndividualPlayerChoice: async supplied => { assert.equal(supplied, token); writes++; return { leadId: 'synthetic-lead' }; },
    TeamLeadPlayerChoiceError: class extends Error {},
  } });
  const action = h.load('src/app/(public)/team-confirmation/[token]/player/actions.ts').chooseIndividualPlayerAction;
  const form = new FormData(); form.set('token', token);
  await assert.rejects(action(form), error => error.location.endsWith('?error=confirm'));
  assert.equal(writes, 0);
  form.set('confirmPlayerInterest', 'yes');
  await assert.rejects(action(form), error => error.location === `${canonicalPath}/player`);
  assert.equal(writes, 1);
});
