const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { harness } = require('../catterick-interest/load.cjs');
const filters = harness({}).load('src/lib/leads/campaign-filters.ts');
const actionPath = 'src/app/(admin)/admin/communications/lead-campaign-actions.ts';
const form = (values = {}) => { const data = new FormData(); for (const [key, value] of Object.entries({ channel: 'EMAIL', type: 'TEAM', status: 'CONTACTED', league: 'catterick-test', ...values })) data.set(key, value); return data; };
const sample = (id, overrides = {}) => ({ id, contactName: `Synthetic ${id}`, interestType: 'TEAM', status: 'CONTACTED', email: `${id}@example.invalid`, phone: '07700 900123', area: 'Richmond', source: null, leagueId: 'catterick-test', league: { name: 'Catterick Monday Mens', season: 'Winter 2026' }, preferredNights: [{ night: 'MONDAY' }], ...overrides });
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'NOT') return (Array.isArray(value) ? value : [value]).every(part => !matches(row, part));
    if (key === 'preferredNights') return row.preferredNights.some(night => matches(night, value.some));
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value) return row[key] !== value.not;
      throw Error(`Unhandled predicate ${key}`);
    }
    return row[key] === value;
  });
}
function setup(rows = Array.from({ length: 25 }, (_, i) => sample(`lead-${i}`)), options = {}) {
  const calls = [];
  const template = { id: 'campaign', key: 'catterick-team-interest-october-2026', audience: 'LEAD', isActive: true, interestType: 'TEAM', subject: 'Catterick starts 5 October', body: 'Hi {{firstName}}', ctaLabel: 'Choose team or individual player', ctaUrlKey: 'teamConfirmationUrl', ...options.template };
  const db = {
    interestLead: { findMany: async input => { calls.push(['read', input]); return rows.filter(row => matches(row, input.where)).slice(0, input.take || rows.length); } },
    emailTemplate: { findFirst: async input => { calls.push(['template', input]); return options.unavailable ? null : template; }, findUnique: async () => template },
    notificationTemplate: { findFirst: async () => options.unavailable ? null : { ...template, interestType: null, channel: 'SMS', ctaUrlKey: 'signupUrl' } },
  };
  const send = name => async (_, data) => { calls.push([name, data]); return { ok: true, sentCount: data.getAll('includedLeadIds').length, failedCount: 0 }; };
  const h = harness(db, {
    '@/lib/requireAdmin': { requireAdmin: async () => { calls.push(['auth']); if (options.denied) throw Error('Unauthorised'); return { user: { id: 'admin-test' } }; } },
    '@/lib/leads/teamPlaceConfirmation': { TEAM_PLACE_CONFIRMATION_CTA_KEY: 'teamConfirmationUrl' },
    [path.resolve('src/app/(admin)/admin/leads/actions')]: { sendBulkLeadEmailAction: send('generic-email'), sendBulkLeadSmsAction: send('sms') },
    [path.resolve('src/app/(admin)/admin/leads/team-confirmation-bulk-action')]: { sendBulkTeamPlaceConfirmationEmailAction: send('team-decision') },
  });
  return { calls, rows, actions: h.load(actionPath) };
}
const sends = calls => calls.filter(call => ['team-decision', 'generic-email', 'sms'].includes(call[0]));
function sendForm(ids, extra = {}) {
  const data = form({ templateId: 'campaign', subject: 'Catterick starts 5 October', body: 'Hi {{firstName}}\n\n{{cta}}', ...extra });
  ids.forEach(id => data.append('includedLeadIds', id));
  return data;
}

test('all seven include/exclude fields round-trip to the Leads console', () => {
  const data = form({ area: 'Richmond', night: 'MONDAY', excludeType: 'PLAYER', excludeStatus: 'CLOSED' });
  const parsed = filters.parseLeadCampaignFilters(data);
  const query = new URL(filters.leadCampaignHref(parsed), 'https://example.invalid').searchParams;
  for (const key of filters.LEAD_FILTER_KEYS) assert.equal(query.get(key), parsed[key]);
  const where = filters.buildLeadFilterWhere(parsed);
  assert.equal(matches(sample('yes'), where), true);
  for (const override of [{ interestType: 'PLAYER' }, { status: 'CLOSED' }, { area: 'York' }, { leagueId: 'elsewhere' }, { preferredNights: [{ night: 'TUESDAY' }] }]) assert.equal(matches(sample('no', override), where), false);
});
test('unassigned means null league, not all leagues', () => {
  const where = filters.buildLeadFilterWhere(filters.parseLeadCampaignFilters(form({ league: 'unassigned' })));
  assert.equal(matches(sample('none', { leagueId: null }), where), true);
  assert.equal(matches(sample('assigned'), where), false);
});
test('contradictory include and exclude selections match nobody', () => {
  const where = filters.buildLeadFilterWhere(filters.parseLeadCampaignFilters(form({ excludeType: 'TEAM' })));
  assert.equal(matches(sample('none'), where), false);
});
for (const [key, value] of [['type', 'ANYTHING'], ['status', 'ACTIVE'], ['night', 'MON'], ['excludeType', 'EVERYONE'], ['excludeStatus', 'DELETED']]) {
  test(`invalid ${key} never broadens the audience`, () => assert.throws(() => filters.parseLeadCampaignFilters(form({ [key]: value }))));
}
test('empty explicit IDs remain empty in the predicate and cannot produce a send form', () => {
  assert.equal(matches(sample('no'), filters.buildLeadCampaignWhere({ ...filters.EMPTY_LEAD_FILTERS }, [])), false);
  assert.throws(() => filters.prepareLeadCampaignSend(new FormData(), filters.EMPTY_LEAD_FILTERS, []));
});
test('read-only preview gives all 25 eligible leads and no send calls', async () => {
  const h = setup(); const response = await h.actions.previewLeadCampaignAction(form());
  assert.equal(response.recipients.length, 25); assert.equal(response.matchingCount, 25);
  assert.equal(sends(h.calls).length, 0); assert.equal(h.calls[0][0], 'auth');
});
test('preview preserves exclusions and reports missing contact details', async () => {
  const h = setup([sample('yes'), sample('closed', { status: 'CLOSED' }), sample('other', { leagueId: 'other' }), sample('none', { email: null }), sample('partner', { source: 'website-expansion-partner' })]);
  const response = await h.actions.previewLeadCampaignAction(form({ status: '', excludeStatus: 'CLOSED' }));
  assert.deepEqual(response.recipients.map(r => r.id), ['yes']); assert.equal(response.matchingCount, 2); assert.equal(response.missingContactCount, 1);
});
test('a large audience is rejected rather than silently truncated to 50 or 1000', async () => {
  const h = setup(Array.from({ length: 1001 }, (_, i) => sample(`row-${i}`)));
  const response = await h.actions.previewLeadCampaignAction(form()); assert.equal(response.ok, false); assert.match(response.error, /Narrow/);
});
test('empty selection cannot fall through to send to everybody', async () => {
  const h = setup(); const response = await h.actions.sendLeadCampaignAction({}, sendForm([]));
  assert.equal(response.ok, false); assert.equal(sends(h.calls).length, 0);
});
test('25 emails require typed confirmation on the server', async () => {
  const h = setup(); const response = await h.actions.sendLeadCampaignAction({}, sendForm(h.rows.map(r => r.id)));
  assert.equal(response.ok, false); assert.match(response.error, /SEND 25 EMAILS/); assert.equal(sends(h.calls).length, 0);
});
test('Catterick uses the actual guarded decision sender, exact selected IDs and saved CTA', async () => {
  const h = setup(); const data = sendForm(h.rows.map(r => r.id), { bulkSendConfirmation: 'SEND 25 EMAILS', ctaUrlKey: 'tampered', ctaLabel: 'tampered' });
  const response = await h.actions.sendLeadCampaignAction({}, data);
  assert.equal(response.ok, true); assert.equal(sends(h.calls).length, 1);
  const [kind, submitted] = sends(h.calls)[0]; assert.equal(kind, 'team-decision');
  assert.deepEqual(submitted.getAll('includedLeadIds'), h.rows.map(r => r.id));
  assert.equal(submitted.get('selectedLeague'), 'catterick-test'); assert.equal(submitted.get('ctaUrlKey'), 'teamConfirmationUrl');
  assert.equal(submitted.get('ctaLabel'), 'Choose team or individual player'); assert.equal(submitted.get('body'), data.get('body'));
});
test('manual exclusions and newly appearing leads never enter the send selection', async () => {
  const h = setup(); const response = await h.actions.sendLeadCampaignAction({}, sendForm(['lead-2', 'lead-6']));
  assert.equal(response.ok, true); assert.deepEqual(sends(h.calls)[0][1].getAll('includedLeadIds'), ['lead-2', 'lead-6']);
});
test('changed lead type, lost contact, changed league and excluded status require a fresh preview', async () => {
  for (const override of [{ interestType: 'PLAYER' }, { email: null }, { leagueId: 'different' }, { status: 'CLOSED' }]) {
    const h = setup([sample('changed', override)]);
    assert.equal((await h.actions.sendLeadCampaignAction({}, sendForm(['changed']))).ok, false);
    assert.equal(sends(h.calls).length, 0);
  }
});
test('SMS delegates to guarded SMS, retaining all filters and selected IDs', async () => {
  const h = setup([sample('one')]); const data = sendForm(['one'], { channel: 'SMS', excludeStatus: 'CLOSED', area: 'Richmond', night: 'MONDAY' });
  const response = await h.actions.sendLeadCampaignAction({}, data); assert.equal(response.ok, true);
  const [kind, submitted] = sends(h.calls)[0]; assert.equal(kind, 'sms'); assert.equal(submitted.get('selectedLeague'), 'catterick-test');
  assert.equal(submitted.get('excludedStatus'), 'CLOSED'); assert.equal(submitted.get('templateCtaUrlKey'), 'signupUrl');
});
test('inactive or wrong-audience templates cannot be sent', async () => {
  const h = setup([sample('one')], { unavailable: true });
  assert.equal((await h.actions.sendLeadCampaignAction({}, sendForm(['one']))).ok, false); assert.equal(sends(h.calls).length, 0);
});
test('preview and send both authenticate before reading recipients', async () => {
  const h = setup([], { denied: true });
  await assert.rejects(h.actions.previewLeadCampaignAction(form()), /Unauthorised/);
  await assert.rejects(h.actions.sendLeadCampaignAction({}, sendForm(['one'])), /Unauthorised/);
  assert.equal(h.calls.some(c => c[0] === 'read'), false);
});
test('Comms owns the filter and selection controls and retains native template and league sources', () => {
  const launch = fs.readFileSync('src/components/admin/communications/CommunicationsLeadLauncher.tsx', 'utf8');
  const client = fs.readFileSync('src/components/admin/communications/CommunicationsLeadCampaigns.tsx', 'utf8');
  assert.match(launch, /prisma\.emailTemplate\.findMany/); assert.match(launch, /getCurrentLeagueOptions/);
  assert.doesNotMatch(launch, /Jump straight there|Open all lead campaigns/);
  for (const key of filters.LEAD_FILTER_KEYS) assert.ok(client.includes(`key: "${key}"`));
  assert.match(client, /Select all matching/); assert.match(client, /Clear selection/); assert.match(client, /bulkSendConfirmation/);
  assert.doesNotMatch(client, /<select\b|MutationObserver|querySelector|innerHTML/);
});
test('prepared Comms filters match the actual Leads page query for every field', { skip: process.env.COMMS_PREPARED !== '1' }, async () => {
  const source = fs.readFileSync('src/app/(admin)/admin/leads/page.tsx', 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node));
  const validators = functions.filter(node => ['isInterestType', 'isLeadStatus', 'isPreferredNight'].includes(node.name?.text)).map(node => node.getText(ast)).join('\n');
  const page = functions.find(node => node.name?.text === 'AdminLeadsPage');
  const declarations = [];
  for (const node of page.body.statements) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast).startsWith('['))) break;
    declarations.push(node.getText(ast));
  }
  assert.ok(declarations.join('\n').includes('const leadWhere'));
  const code = ts.transpileModule(`${validators}\nasync function query(searchParams) { ${declarations.join('\n')} return leadWhere; }\nmodule.exports = query;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} }; new Function('module', 'requireAdmin', code)(mod, async () => {});
  for (const values of [{}, { type: 'TEAM' }, { status: 'CONTACTED', excludeType: 'PLAYER', excludeStatus: 'CLOSED' }, { area: 'Richmond', night: 'MONDAY', league: 'catterick-test' }, { league: 'unassigned' }, { type: 'PLAYER', excludeType: 'PLAYER' }]) {
    const actual = await mod.exports(Promise.resolve(values));
    const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v);
    assert.deepEqual(filters.buildLeadFilterWhere(filters.parseLeadCampaignFilters(data)), actual);
  }
});
