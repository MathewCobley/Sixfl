const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');
const actionPath = 'src/app/(admin)/admin/cups/[id]/invitation-actions.ts';
const pagePath = 'src/app/(admin)/admin/cups/[id]/invitations/page.tsx';

// Execute the real modules. Unlisted dependencies fail closed; no network,
// production database, email provider or customer account is available here.
function load(file, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', js)(id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith('node:') || ['react', 'react/jsx-runtime'].includes(id)) return require(id);
    throw new Error(`Unlisted dependency / I/O blocked: ${id}`);
  }, module, module.exports);
  return module.exports;
}
const policy = load('src/lib/cups/invitation-policy.ts');
const terms = { cupName: 'Test Cup', cupFormat: 'straight knockout', matchFeePence: 4000, venueNote: 'Test venue', scheduleNote: 'Test night', responseDeadline: '2099-01-01T18:00:00.000Z' };
const oldTime = new Date('2026-09-15T16:00:00Z');
function form(overrides = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ cupId: 'cup', teamId: 'team', invitationId: 'invite', responseVersion: '3', settingsVersion: '2', response: 'YES', ...overrides })) {
    if (value !== null) result.set(key, String(value));
  }
  return result;
}
function harness(options = {}) {
  let invitation = { id: 'invite', cupLeagueId: 'cup', teamId: 'team', settingsVersion: 2, terms, response: 'NO', responseVersion: 3, respondedAt: oldTime, respondedByName: 'Original Captain', lastReminderAt: oldTime, createdAt: oldTime, ...options.invitation };
  const writes = [], audits = [], refreshed = [];
  let locked = false;
  const db = {
    $queryRaw: async (strings, ...values) => {
      assert.ok(locked); assert.match(strings.join('?'), /FROM "LeagueSeasonTeam"/); assert.deepEqual(values, ['cup', 'team']);
      return options.withdrawn ? [{ id: 'entry' }] : [];
    },
    $executeRaw: async (strings, ...values) => {
      const sql = strings.join('?'); assert.ok(locked); writes.push({ sql, values });
      if (sql.includes('UPDATE "CupInvitation"')) {
        assert.equal(values.at(-1), 'invite'); assert.doesNotMatch(sql, /"lastReminderAt"\s*=/);
        invitation = { ...invitation, responseVersion: invitation.responseVersion + 1,
          response: sql.includes("response='PENDING'") ? 'PENDING' : values[0],
          respondedAt: sql.includes("response='PENDING'") ? null : new Date(),
          respondedByName: sql.includes("response='PENDING'") ? null : values[1] };
      } else {
        assert.match(sql, /UPDATE "NotificationDispatch"/); assert.match(sql, /d.status='QUEUED'/);
        assert.match(sql, /m\."invitationId"=\?/); assert.deepEqual(values, ['invite']);
      }
      return 1;
    },
  };
  const prisma = { $transaction: async fn => {
    const original = structuredClone(invitation), w = writes.length, a = audits.length;
    try { return await fn(db); } catch (error) { invitation = original; writes.length = w; audits.length = a; throw error; }
    finally { locked = false; }
  } };
  const action = load(actionPath, {
    'next/cache': { revalidatePath: value => refreshed.push(value) },
    '@/lib/requireAdmin': { requireAdmin: async () => { if (options.anonymous) throw new Error('LOGIN_REQUIRED'); return { user: { id: 'authenticated-admin' } }; } },
    '@/lib/prisma': { prisma },
    '@/lib/cups/invitation-policy': policy,
    '@/lib/cups/invitation-data': {
      assertCupAdmin: async (id, client) => { assert.equal(id, 'authenticated-admin'); assert.equal(client, db); if (options.nonAdmin) throw new policy.CupInvitationError('Administrator access is required.'); return { id, name: 'SIXFL Operator' }; },
      loadCup: async (id, client, lock) => { assert.equal(id, 'cup'); assert.equal(client, db); assert.equal(lock, true); locked = true; return { id, settings: options.missingSettings ? null : { version: options.outdated ? 9 : 2, state: 'CLOSED' } }; },
      loadInvitation: async (cupId, teamId, client) => { assert.deepEqual([cupId, teamId], ['cup', 'team']); assert.equal(client, db); return options.missingInvitation ? null : invitation; },
      isCupEntrant: async () => Boolean(options.entered), cupTerms: () => terms,
    },
    '@/lib/cups/invitations': {
      termsEqual: (a, b) => Object.keys(b).every(key => a[key] === b[key]),
      cupErrorMessage: error => error instanceof policy.CupInvitationError ? error.message : 'Save failed safely',
      cupAudit: async (client, ...args) => { assert.equal(client, db); if (options.auditFails) throw new Error('AUDIT_FAILURE'); audits.push(args); },
    },
  }).updateCupResponseAction;
  return { action, writes, audits, refreshed, invitation: () => invitation };
}

for (const previous of ['PENDING', 'YES', 'NO']) for (const response of ['PENDING', 'YES', 'NO']) {
  test(`admin correction ${previous} -> ${response} keeps reminders and separate entry state`, async () => {
    const h = harness({ invitation: { response: previous } });
    const saved = await h.action({}, form({ response, actorId: 'forged-browser-user' }));
    assert.ok(saved.success, JSON.stringify(saved)); assert.equal(h.invitation().response, response);
    assert.deepEqual(h.invitation().lastReminderAt, oldTime);
    if (previous === response) { assert.equal(h.writes.length, 0); assert.equal(h.audits.length, 0); }
    else {
      assert.equal(h.invitation().responseVersion, 4); assert.equal(h.audits.length, 1);
      const [cup, team, actorId, name, event, details] = h.audits[0];
      assert.deepEqual([cup, team, actorId, name, event], ['cup', 'team', 'authenticated-admin', 'SIXFL Operator (admin)', 'RESPONSE_ADMIN_EDITED']);
      assert.equal(details.previous, previous); assert.equal(details.response, response);
      assert.equal(details.previousRespondedByName, 'Original Captain'); assert.deepEqual(details.previousRespondedAt, oldTime);
      assert.equal(h.writes.length, response === 'PENDING' ? 1 : 2);
      assert.equal(h.invitation().respondedByName, response === 'PENDING' ? null : 'SIXFL Operator (admin)');
    }
    assert.ok(h.refreshed.includes('/admin/cups/cup/invitations/history'));
    assert.ok(h.refreshed.includes('/admin/cups/cup/invitations/export'));
  });
}

test('authentication and saved admin role cannot be supplied by the form', async () => {
  const anonymous = harness({ anonymous: true }); await assert.rejects(anonymous.action({}, form()), /LOGIN_REQUIRED/);
  const other = harness({ nonAdmin: true }); assert.match((await other.action({}, form())).error, /Administrator/);
  assert.equal(other.writes.length, 0);
});
test('invalid or stale snapshots cannot overwrite newer captain responses', async () => {
  for (const invalid of [{ response: 'INVALID' }, { invitationId: null }, { responseVersion: null }, { responseVersion: '-1' }, { responseVersion: 'NaN' }, { responseVersion: '1.5' }, { responseVersion: '9007199254740993' }, { settingsVersion: null }, { invitationId: 'other' }, { responseVersion: '2' }, { settingsVersion: '1' }]) {
    const h = harness(); const result = await h.action({}, form(invalid)); assert.ok(result.error, JSON.stringify(invalid)); assert.equal(h.writes.length, 0); assert.equal(h.audits.length, 0);
  }
});
test('confirmed, withdrawn, uninvited and superseded invitation records remain protected', async () => {
  for (const options of [{ entered: true }, { withdrawn: true }, { missingInvitation: true }, { missingSettings: true }, { outdated: true }, { invitation: { terms: { ...terms, matchFeePence: 9999 } } }]) {
    const h = harness(options); assert.ok((await h.action({}, form())).error); assert.equal(h.writes.length, 0); assert.equal(h.audits.length, 0);
  }
});
test('failed audit rolls back the response and pending-mail cancellation', async () => {
  const h = harness({ auditFails: true }); assert.ok((await h.action({}, form())).error);
  assert.equal(h.invitation().response, 'NO'); assert.equal(h.invitation().responseVersion, 3); assert.equal(h.writes.length, 0); assert.equal(h.refreshed.length, 0);
});
test('the actual report mounts snapshot-bound editors without changing filters, entry review or history', async () => {
  const editors = [], reads = [];
  const rows = ['PENDING', 'YES', 'NO', 'OUTDATED', 'NOT_INVITED', 'CONFIRMED', 'WITHDRAWN'].map((status, index) => ({
    id: `team-${index}`, teamName: status, sourceLeagueId: 'league', sourceLeagueName: 'Test League', eligible: true,
    entered: status === 'CONFIRMED', withdrawn: status === 'WITHDRAWN', response: ['CONFIRMED', 'WITHDRAWN'].includes(status) ? 'YES' : status,
    invitation: status === 'NOT_INVITED' ? null : { id: `invite-${index}`, responseVersion: 3, settingsVersion: 2, respondedAt: oldTime, respondedByName: 'Captain', lastReminderAt: oldTime, createdAt: oldTime },
    contacts: [{ name: 'Captain', email: 'captain@example.invalid' }], messages: [], deliveryProblem: false,
  }));
  const Page = load(pagePath, {
    'next/link': { __esModule: true, default: props => React.createElement('a', props, props.children) },
    '@/components/admin/AdminSelect': { __esModule: true, default: () => null },
    '@/components/cups/CupInvitationComposer': { __esModule: true, default: () => null },
    '@/components/cups/CupResponseEditor': { __esModule: true, default: props => { editors.push(props); return React.createElement('span', null, 'Editor'); } },
    '@/lib/requireAdmin': { requireAdmin: async () => ({ user: { id: 'admin' } }) },
    '@/lib/prisma': { prisma: { emailTemplate: { findMany: async () => [] } } },
    '@/lib/cups/invitations': { getCupInvitationReport: async (...args) => { reads.push(args); return { cup: { settings: { state: 'CLOSED', responseDeadline: oldTime } }, rows, counts: policy.summaryCounts(rows) }; } },
    '@/lib/cups/invitation-policy': policy,
    '../invitation-actions': { updateCupResponseAction: 'test-action' },
  }).default;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: 'cup' }), searchParams: Promise.resolve({ league: 'league' }) }));
  assert.deepEqual(reads, [['cup', 'admin']]); assert.equal(editors.length, 3);
  for (let i = 0; i < 3; i++) assert.deepEqual(editors[i], { cupId: 'cup', teamId: `team-${i}`, invitationId: `invite-${i}`, responseVersion: 3, settingsVersion: 2, response: rows[i].response, action: 'test-action' });
  assert.match(html, /Review \/ confirm entry/); assert.match(html, /Email delivery and contact history/);
  assert.match(html, /export\?league=league/); assert.match(html, /invitation and entry audit/);
});

// The database test is enabled only AFTER disposable schema/migrations exist.
// Native/prepared unit checks above never need a Prisma client or a database.
if (process.env.CUP_ADMIN_RESPONSE_DATABASE === '1') {
  test('real PostgreSQL admin action: attribution, cancellation scope, snapshot races and audit rollback', async () => {
    const url = new URL(process.env.DATABASE_URL || 'http://invalid');
    assert.equal(process.env.CUP_TEST_DATABASE, '1'); assert.ok(['localhost', '127.0.0.1'].includes(url.hostname)); assert.equal(url.pathname, '/sixfl_cup_invitation_test');
    const client = require('@prisma/client'), db = new client.PrismaClient();
    const { randomUUID } = require('node:crypto'); const prefix = randomUUID();
    const forbidden = () => { throw new Error('Provider / unrelated side effect forbidden'); };
    const previousFetch = global.fetch; global.fetch = forbidden;
    try {
      const admin = await db.user.create({ data: { name: 'Test response admin', role: 'ADMIN' } });
      const captain = await db.user.create({ data: { name: 'Original response captain' } });
      const comp = await db.leagueCompetition.create({ data: { name: `Edit test ${prefix}`, slug: prefix, leagueType: 'MENS', competitionType: 'CUP', cupFormat: 'KNOCKOUT', isInterLeague: true } });
      const cup = await db.league.create({ data: { name: comp.name, slug: prefix, competitionId: comp.id, leagueType: 'MENS' } });
      const team = await db.team.create({ data: { name: `Edit team ${prefix}`, claimCode: prefix } });
      const data = load('src/lib/cups/invitation-data.ts', { '@prisma/client': client, '@/lib/prisma': { prisma: db }, '@/lib/current-leagues': { getCurrentLeagueIds: forbidden }, './invitation-policy': policy });
      const serviceMocks = { '@prisma/client': client, '@/lib/prisma': { prisma: db }, './invitation-data': data, './invitation-policy': policy };
      for (const id of ['@/lib/email/template-cta', '@/lib/notifications/team-operational-recipients', '@/lib/notifications/service', '@/lib/notifications/renderer', '@/lib/datetime/london']) serviceMocks[id] = new Proxy({}, { get: () => forbidden });
      const services = load('src/lib/cups/invitations.ts', serviceMocks);
      let actorId = admin.id;
      const action = load(actionPath, { 'next/cache': { revalidatePath() {} }, '@/lib/requireAdmin': { requireAdmin: async () => ({ user: { id: actorId } }) }, '@/lib/prisma': { prisma: db }, '@/lib/cups/invitation-data': data, '@/lib/cups/invitations': services, '@/lib/cups/invitation-policy': policy }).updateCupResponseAction;
      const deadline = new Date('2099-01-01T18:00:00Z');
      await db.$executeRaw`INSERT INTO "CupInvitationSettings" ("cupLeagueId","matchFeePence","venueNote","scheduleNote","responseDeadline",state,version,"termsHash") VALUES (${cup.id},4000,'Test venue','Test night',${deadline},'CLOSED',2,'test')`;
      const savedTerms = data.cupTerms(await data.loadCup(cup.id)); const invitationId = randomUUID();
      await db.$executeRaw`INSERT INTO "CupInvitation" (id,"cupLeagueId","teamId","settingsVersion",terms,response,"responseVersion","respondedAt","respondedByName","respondedByUserId","lastReminderAt") VALUES (${invitationId},${cup.id},${team.id},2,${JSON.stringify(savedTerms)}::jsonb,'NO',3,${oldTime},${captain.name},${captain.id},${oldTime})`;
      const recipient = await db.notificationRecipient.create({ data: { sourceType: 'GENERAL', sourceId: prefix, audience: 'TEAM', email: `${prefix}@example.invalid` } });
      const dispatches = [];
      for (const [index, status] of ['QUEUED', 'SENT', 'PROCESSING'].entries()) {
        const dispatch = await db.notificationDispatch.create({ data: { recipientId: recipient.id, channel: 'EMAIL', audience: 'TEAM', bodyText: 'Original invitation', status } }); dispatches.push(dispatch);
        await db.$executeRaw`INSERT INTO "CupInvitationMessage" (id,"invitationId","settingsVersion",kind,batch,"recipientId","recipientEmail","recipientName","dispatchId") VALUES (${randomUUID()},${invitationId},2,'INITIAL',${index},${recipient.id},${recipient.email},'Original captain',${dispatch.id})`;
      }
      const unrelated = await db.notificationDispatch.create({ data: { recipientId: recipient.id, channel: 'EMAIL', audience: 'TEAM', bodyText: 'Unrelated message', status: 'QUEUED' } });
      const input = (response, version = 3) => form({ cupId: cup.id, teamId: team.id, invitationId, responseVersion: version, response });
      const invariant = async () => ({ teams: await db.team.findUnique({ where: { id: team.id } }), entries: await db.$queryRaw`SELECT * FROM "LeagueSeasonTeam" WHERE "leagueId"=${cup.id}`, charges: await db.paymentCharge.count(), messages: await db.$queryRaw`SELECT * FROM "CupInvitationMessage" WHERE "invitationId"=${invitationId} ORDER BY id`, dispatches: await db.notificationDispatch.count() });
      const before = await invariant();
      assert.ok((await action({}, input('YES'))).success);
      let saved = await data.loadInvitation(cup.id, team.id); assert.equal(saved.response, 'YES'); assert.equal(saved.responseVersion, 4); assert.match(saved.respondedByName, /admin/); assert.deepEqual(saved.lastReminderAt, oldTime);
      assert.deepEqual(await invariant(), before);
      assert.equal((await db.notificationDispatch.findUnique({ where: { id: dispatches[0].id } })).status, 'CANCELLED');
      for (const item of [...dispatches.slice(1), unrelated]) assert.equal((await db.notificationDispatch.findUnique({ where: { id: item.id } })).status, item.status);
      const audit = (await db.$queryRaw`SELECT * FROM "CupInvitationAudit" WHERE "cupLeagueId"=${cup.id}`)[0];
      assert.equal(audit.actorUserId, admin.id); assert.equal(audit.details.previousRespondedByName, captain.name); assert.equal(audit.details.previous, 'NO'); assert.equal(audit.details.response, 'YES');
      assert.match((await action({}, input('NO'))).error, /changed in another window/);
      assert.ok((await action({}, input('PENDING', 4))).success); saved = await data.loadInvitation(cup.id, team.id);
      assert.equal(saved.respondedAt, null); assert.equal(saved.respondedByName, null); assert.deepEqual(saved.lastReminderAt, oldTime);
      const competing = await Promise.all([action({}, input('YES', 5)), action({}, input('NO', 5))]);
      assert.equal(competing.filter(r => r.success).length, 1); assert.equal(competing.filter(r => r.error).length, 1);
      saved = await data.loadInvitation(cup.id, team.id); assert.equal(saved.responseVersion, 6);
      actorId = captain.id; assert.match((await action({}, input('PENDING', 6))).error, /Administrator/); actorId = admin.id;
      await db.$executeRaw`INSERT INTO "LeagueSeasonTeam" (id,"leagueId","teamId","isActive") VALUES (${randomUUID()},${cup.id},${team.id},true)`;
      assert.match((await action({}, input('PENDING', 6))).error, /confirmed entrant/);
      await db.$executeRaw`UPDATE "LeagueSeasonTeam" SET "isActive"=false WHERE "leagueId"=${cup.id} AND "teamId"=${team.id}`;
      assert.match((await action({}, input('PENDING', 6))).error, /withdrawn/);
      await db.$executeRaw`DELETE FROM "LeagueSeasonTeam" WHERE "leagueId"=${cup.id} AND "teamId"=${team.id}`;
      await db.$executeRaw`UPDATE "CupInvitationSettings" SET version=9 WHERE "cupLeagueId"=${cup.id}`;
      assert.match((await action({}, input('PENDING', 6))).error, /out of date/);
      await db.$executeRaw`UPDATE "CupInvitationSettings" SET version=2 WHERE "cupLeagueId"=${cup.id}`;
      await db.$executeRawUnsafe(`CREATE FUNCTION test_admin_response_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END; $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER test_admin_response_audit_failure BEFORE INSERT ON "CupInvitationAudit" FOR EACH ROW EXECUTE FUNCTION test_admin_response_audit_failure()');
      try { assert.ok((await action({}, input('PENDING', 6))).error); assert.deepEqual(await data.loadInvitation(cup.id, team.id), saved); }
      finally { await db.$executeRawUnsafe('DROP TRIGGER test_admin_response_audit_failure ON "CupInvitationAudit"'); await db.$executeRawUnsafe('DROP FUNCTION test_admin_response_audit_failure()'); }
      assert.deepEqual(await invariant(), before);
      console.log('PASS real admin action, scoped cancellation, audit attribution, closed-cup correction, reminder preservation, concurrent edits, entrant protection and rollback');
    } finally { await db.$disconnect(); global.fetch = previousFetch; }
  });
}
