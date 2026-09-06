const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sourcePath = 'src/lib/fixtures/last-minute-replacement-resolution.ts';
const migrationPath = 'prisma/migrations/20260906222500_neutral_extra_fixture_covered_templates/migration.sql';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}, suffix = '') {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file) + suffix, {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), mod, mod.exports);
  return mod.exports;
}
const { renderNotificationText, extractNotificationTokens } = load('src/lib/notifications/renderer.ts');
let sql, templates;
test.before(() => {
  const url = process.env.COVERED_COPY_TEST_DATABASE_URL;
  assert.ok(url, 'Dedicated local test database required');
  const parsed = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/sixfl_covered_copy_test');
  sql = query => execFileSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', '-Atc', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  sql(`CREATE TYPE "NotificationTemplateKind" AS ENUM ('TRANSACTIONAL','MARKETING');
    CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL','SMS');
    CREATE TYPE "NotificationAudience" AS ENUM ('TEAM');
    CREATE TABLE "NotificationTemplate" (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT,
      kind "NotificationTemplateKind", channel "NotificationChannel", audience "NotificationAudience", subject TEXT,
      body TEXT NOT NULL, "isActive" BOOLEAN NOT NULL, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL);`);
  sql(read(migrationPath));
  templates = JSON.parse(sql('SELECT json_agg(t ORDER BY key) FROM "NotificationTemplate" t'));
});
const input = {
  teamId: 'silent-team', role: 'not_selected', fixtureId: 'fixture', droppedTeamId: 'dropped',
  replacementTeamId: 'replacement', replacementTeamName: 'Replacement FC', opponentTeamId: 'opponent', opponentTeamName: 'Opponent FC',
  kickoffAt: new Date('2026-09-08T20:20:00Z'), venueName: 'Test Sports Centre', pitch: '1', replacementFeePence: 0, createdByUserId: 'admin-test',
};
function harness(options = {}) {
  const queued = [], direct = [], logged = [], processed = [], contacts = [];
  const team = id => ({ id, name: id === 'silent-team' ? 'Example FC' : id, leagueId: 'league', logoUrl: '/team-logo.png', league: { name: 'Example league', season: 'Summer 2026' } });
  const prisma = {
    team: { findUnique: async ({ where }) => options.missingTeam ? null : team(where.id) },
    fixture: { findUnique: async () => ({ id: 'fixture', status: 'SCHEDULED', kickoffAt: new Date('2099-09-08T20:20:00Z'),
      pitch: '1', matchFeePence: 4000, homeTeam: {id:'replacement',name:'Replacement FC'}, awayTeam:{id:'opponent',name:'Opponent FC'},
      venue:{name:'Test Sports Centre'}, league:{venueName:'Test Sports Centre'}, paymentCharges:[{teamId:'replacement',amountPence:0}] }) },
    $queryRaw: async query => {
      const text = query.sql;
      if (text.includes('INSERT INTO "LastMinuteReplacementResolution"')) return [{ id: 'resolution' }];
      if (text.includes('FROM "LastMinuteReplacementResolution"')) return options.alreadyResolved ? [{id:'old',fixtureId:'fixture',droppedTeamId:'dropped',replacementTeamId:'replacement',opponentTeamId:'opponent',replacementTeamName:'Replacement FC',opponentTeamName:'Opponent FC',resolvedAt:new Date()}] : [];
      if (text.includes('SELECT DISTINCT dispatch.')) return ['silent-team','declined-team','replacement','opponent','dropped'].map(teamId => ({teamId}));
      if (text.includes('FROM "NotificationDispatch"')) return [{ fixtureId:'fixture',droppedTeamId:'dropped',opponentTeamId:'opponent',createdAt:new Date() }];
      throw new Error('Unexpected query in isolated test');
    },
  };
  const module = load(sourcePath, {
    '@/lib/prisma': { prisma },
    './replacement-sms-lifecycle': { cancelClosedReplacementSms: async () => 0, REPLACEMENT_SMS_CANCEL_REASON: 'Replacement request closed — unsent SMS cancelled.' },
    '@/lib/communications/send-team-broadcast': { sendTeamBroadcastMessage: async payload => { direct.push(payload); return {dispatchId:`direct-${direct.length}`}; } },
    '@/lib/notifications/processor': { processNotificationQueue: async count => { processed.push(count); } },
    '@/lib/notifications/team-contacts': { upsertTeamNotificationRecipient: async id => { contacts.push(id);return {recipient:{id:`recipient-${id}`},snapshot:{teamName:team(id).name,primaryContact:{name:options.noName ? null : 'Ben Example'}}}; } },
    '@/lib/notifications/service': { queueNotificationFromTemplate: async payload => {
      if (options.inactive) throw new Error('Notification template not found or inactive.');
      queued.push(payload); return {id:`template-${queued.length}`,status:options.skipSms && payload.templateKey.endsWith('-sms')?'SKIPPED':'QUEUED'};
    } },
    '@/lib/communications/log-dispatch': { logNotificationDispatchToThread: async payload => { logged.push(payload); } },
  }, '\nexport const testSendResolutionMessage = sendResolutionMessage;');
  return {...module, queued, direct, logged, processed, contacts};
}

test('email and SMS defaults are neutral, fully renderable, transactional team templates', async () => {
  const h = harness();
  await h.testSendResolutionMessage(input);
  assert.equal(templates.length, 2);
  for (const template of templates) {
    const payload = h.queued.find(row => row.templateKey === template.key);
    assert.ok(payload);
    assert.equal(template.kind, 'TRANSACTIONAL'); assert.equal(template.audience, 'TEAM');
    const subject = renderNotificationText(template.subject || '', payload.variables);
    const body = renderNotificationText(template.body, payload.variables);
    assert.deepEqual(extractNotificationTokens(subject + body), []);
    assert.match(body, /21:20/); assert.match(body, /Replacement FC/);
    assert.match(body, /Example FC are not required for this extra game/);
    assert.match(body, /no reply is needed/i);
    assert.equal(/thanks|thank you|being available|volunteer/i.test(body), false);
    if (template.channel === 'EMAIL') {
      assert.equal(subject, 'SIXFL extra fixture now covered at 21:20');
      assert.ok(body.startsWith('Hi Ben,')); assert.match(body, /Tuesday 8 September/);
    }
  }
});

test('both channels retain the original team recipient, thread, branding and resolution metadata', async () => {
  const h = harness(); const ids = await h.testSendResolutionMessage(input);
  assert.deepEqual(h.contacts, ['silent-team']); assert.equal(h.direct.length, 0);
  assert.deepEqual(ids, ['template-1','template-2']); assert.equal(h.logged.length, 2);
  assert.deepEqual(h.queued.map(row => row.templateKey), ['last-minute-extra-fixture-covered-email','last-minute-extra-fixture-covered-sms']);
  for (const row of h.queued) {
    assert.equal(row.recipientId, 'recipient-silent-team'); assert.equal(row.sourceType,'TEAM'); assert.equal(row.sourceId,'silent-team');
    assert.equal(row.metadata.origin,'night-board-last-minute-replacement-resolved');
    assert.equal(row.metadata.fixtureId,'fixture'); assert.equal(row.metadata.role,'not_selected');
    assert.equal(row.metadata.teamId,'silent-team'); assert.equal(row.metadata.droppedTeamId,'dropped');
    assert.equal(row.createdByUserId,'admin-test'); assert.equal('body' in row,false); assert.equal('subject' in row,false);
    assert.equal('urgent' in row,false); assert.equal('scheduledFor' in row,false);
  }
  assert.deepEqual(h.queued[0].emailBranding,{teamName:'Example FC',teamLogoUrl:'/team-logo.png',leagueName:'Example league — Summer 2026'});
  assert.equal(h.queued[1].emailBranding,undefined);
});

test('selected replacement and opponent still get their specific unchanged confirmation', async () => {
  for (const role of ['replacement','opponent']) {
    const h = harness(); await h.testSendResolutionMessage({...input,role});
    assert.equal(h.queued.length,0); assert.equal(h.direct.length,2);
    assert.match(h.direct[0].body, role==='replacement'?/have been allocated the extra fixture against Opponent FC/:/fixture will now be against Replacement FC/);
    assert.equal(h.direct[0].metadata.role,role);
    if (role==='replacement') assert.match(h.direct[0].body,/There is no charge for this extra game/);
  }
});

test('contacted non-responders and declined teams still receive neutral closure, excluding the dropped team', async () => {
  const h = harness(); const result = await h.reconcileLastMinuteReplacement({fixtureId:'fixture',createdByUserId:'admin-test'});
  assert.equal(result.resolved,true); assert.equal(result.contactedTeams,4); assert.equal(result.failedTeams,0);
  assert.deepEqual(h.contacts.sort(),['declined-team','silent-team']);
  assert.equal(h.queued.length,4); assert.equal(h.direct.length,4); assert.equal(h.processed.length,1);
  assert.deepEqual([...new Set(h.direct.map(row=>row.teamId))].sort(),['opponent','replacement']);
  assert.equal(h.queued.some(row=>row.sourceId==='dropped'),false);
});

test('already resolved cycles do not send the revised copy again', async () => {
  const h=harness({alreadyResolved:true}); const result=await h.reconcileLastMinuteReplacement({fixtureId:'fixture'});
  assert.equal(result.reason,'already_resolved');
  assert.equal(h.queued.length+h.direct.length+h.processed.length,0);
});

test('inactive/missing templates have no hard-coded fallback and skipped SMS retains history', async () => {
  const disabled=harness({inactive:true}); await assert.rejects(disabled.testSendResolutionMessage(input),/inactive/);
  assert.equal(disabled.direct.length,0);
  const missing=harness({missingTeam:true}); await assert.rejects(missing.testSendResolutionMessage(input),/Team not found/);
  assert.equal(missing.queued.length,0);
  const skipped=harness({skipSms:true}); await skipped.testSendResolutionMessage(input);
  assert.equal(skipped.logged.find(row=>row.dispatch.id==='template-2').dispatch.status,'SKIPPED');
});

test('migration replay preserves edited copy and disabled template settings', () => {
  sql(`UPDATE "NotificationTemplate" SET body='Administrator wording',subject='Custom subject',"isActive"=false WHERE channel='EMAIL';`);
  const before=sql('SELECT json_agg(t ORDER BY key) FROM "NotificationTemplate" t');
  sql(read(migrationPath));
  assert.equal(sql('SELECT json_agg(t ORDER BY key) FROM "NotificationTemplate" t'),before);
  assert.equal(sql('SELECT COUNT(*) FROM "NotificationTemplate"'),'2');
});

test('prepared source contains no superseded closure copy or history rewrite', () => {
  const source=read(sourcePath);
  assert.equal(source.includes('Thanks for being ' + 'available'),false);
  assert.equal(source.includes('Thanks — the extra'),false);
  const migration=read(migrationPath);
  assert.equal(/UPDATE\s+"(?:NotificationDispatch|Message|ThreadMessage|Fixture|PaymentCharge)"/i.test(migration),false);
  assert.ok(read('src/app/api/admin/night-board/last-minute-replacement/reconcile/route.ts').includes('reconcileLastMinuteReplacement'));
  assert.ok(read('src/app/api/cron/notifications/route.ts').includes('reconcilePendingLastMinuteReplacements'));
});
