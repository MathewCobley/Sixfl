const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = 'prisma/migrations/20260907214500_managed_squad_registration_reminders/migration.sql';
const baseNow = new Date('2026-09-08T12:00:00Z');
const H = 3600000;
const ago = (h) => new Date(baseNow.getTime() - h * H);
const dbUrl = new URL(process.env.DATABASE_URL || 'https://invalid');
assert.ok(process.env.SIXFL_ISOLATED_REGISTRATION_TEST === '1' && dbUrl.hostname === '127.0.0.1' && dbUrl.pathname === '/sixfl_registration_test', 'Disposable localhost database only');
const prisma = new PrismaClient();
const sql = (query) => execFileSync('psql', [dbUrl.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-Atc', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const apply = (file) => sql(read(file));
let providerCalls = [], failProvider = false, phoneIndex = 0;
// Real notification service/renderer, PostgreSQL queries and queue processor;
// only external providers and unrelated feature guards are substituted.
function loader() {
  const cache = new Map();
  const mocks = {
    '@/lib/prisma': { prisma },
    '@/lib/fixtures/publishing': { getUnpublishedFixtureBlockReason: async () => null },
    '@/lib/fixtures/replacement-sms-lifecycle': { cancelClosedReplacementSms: async () => 0, getReplacementSmsCancellationReason: async () => null, cancelOwnedReplacementSms: async () => 0 },
    '@/lib/referees/evening-notifications': { refereeEveningDeliveryBlock: async () => null },
    '@/lib/player-pool/profile-sms-reminders': { getPlayerPoolProfileSmsDeliveryBlock: async () => null },
    './providers/resend': { sendEmailWithResend: async (input) => {
      providerCalls.push({ channel: 'EMAIL', input }); if (failProvider) throw new Error('Simulated provider failure');
      return { provider: 'resend', providerMessageId: randomUUID(), fromEmail: 'test@example.invalid', responsePayload: {} };
    } },
    './providers/twilio': { sendSmsWithTwilio: async (input) => {
      providerCalls.push({ channel: 'SMS', input }); if (failProvider) throw new Error('Simulated provider failure');
      return { provider: 'twilio', providerMessageId: randomUUID(), fromNumber: '+447700900000', responsePayload: {} };
    } },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const js = ts.transpileModule(read(file), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const req = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? 'src/' + id.slice(2) : path.join(path.dirname(file), id);
        const target = [base, base + '.ts', base + '.tsx', base + '/index.ts'].find((p) => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
        if (target) return load(target);
      }
      return require(id);
    };
    new Function('require', 'module', 'exports', js)(req, module, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader();
const policy = load('src/lib/managed-squad/registration-reminder-policy.ts');
const service = load('src/lib/managed-squad/registration-reminders.ts');
const processor = load('src/lib/notifications/processor.ts');
const invite = load('src/lib/managed-squad/prospectJoinConfirmation.ts');
const SRC = policy.REGISTRATION_SOURCE;
const get = (id) => prisma.notificationDispatch.findUniqueOrThrow({ where: { id }, include: { recipient: true } });
const queue = (t, now = baseNow) => service.queueDueRegistrationReminder(t.prospect.id, now);
const inspect = (t) => service.inspectRegistrationReminder(t.prospect.id);

async function target({ hours = 25, phone = true, inviteStatus = 'SENT', teamMode = 'MANAGED', status = 'CONTACTED', activeLeague = true } = {}) {
  const id = randomUUID();
  const league = await prisma.league.create({ data: { name: `Test ${id}`, slug: id, isActive: activeLeague, dayOfWeek: 'MONDAY', venueName: 'Test venue' } });
  const team = await prisma.team.create({ data: { name: `Squad ${id}`, claimCode: id, leagueId: league.id, teamMode, isRecruiting: false } });
  const prospect = await prisma.teamPlayerProspect.create({ data: { teamId: team.id, firstName: 'Test', lastName: 'Player', email: `${id}@example.invalid`, phone: phone ? `07700900${String(++phoneIndex).padStart(3, '0')}` : null, status } });
  const recipient = await prisma.notificationRecipient.create({ data: {
    sourceType: 'GENERAL', sourceId: `team-prospect:${prospect.id}`, audience: 'PLAYER', email: prospect.email, phone: prospect.phone,
    emailNormalized: prospect.email, preferences: { create: {} },
  } });
  if (inviteStatus) await prisma.notificationDispatch.create({ data: {
    recipientId: recipient.id, channel: 'EMAIL', audience: 'PLAYER', subject: 'Test invite', bodyText: 'Test invite',
    sourceType: policy.REGISTRATION_INVITE_SOURCE, sourceId: prospect.id, metadata: { teamId: team.id }, status: inviteStatus,
    sentAt: inviteStatus === 'SENT' ? ago(hours) : null, createdAt: ago(hours + 1), scheduledFor: ago(hours + 1),
  } });
  return { prospect, recipient, team, league };
}
async function prior(t, stage = 1, hours = 49, sourceType = SRC, status = 'SENT') {
  const channel = stage === 2 ? 'EMAIL' : 'SMS';
  const template = await prisma.notificationTemplate.findUniqueOrThrow({ where: { key: policy.registrationTemplateKey(stage, channel) } });
  return prisma.notificationDispatch.create({ data: {
    recipientId: t.recipient.id, channel, audience: 'PLAYER', templateId: template.id,
    sourceType, sourceId: t.prospect.id, bodyText: 'Test reminder', subject: 'Test reminder', status,
    metadata: { teamId: t.team.id, stage, contactEmail: t.prospect.email, contactPhone: t.prospect.phone ? '+44' + t.prospect.phone.slice(1) : null },
    variables: { joinConfirmationUrl: invite.getManagedSquadJoinConfirmationUrl(t.prospect.id) },
    sentAt: status === 'SENT' ? ago(hours) : null, createdAt: ago(hours), scheduledFor: ago(hours),
  } });
}
async function inbound(t, channel = 'EMAIL', cachedOnly = false) {
  const thread = await prisma.messageThread.create({ data: { channel, status: 'ARCHIVED', recipientId: t.recipient.id, latestInboundAt: ago(1) } });
  if (!cachedOnly) await prisma.messageEntry.create({ data: { threadId: thread.id, channel, direction: 'INBOUND', body: 'Can you help?',
    fromEmail: channel === 'EMAIL' ? ` ${t.prospect.email.toUpperCase()} ` : null, fromNumber: channel === 'SMS' ? '+44' + t.prospect.phone.slice(1) : null, receivedAt: ago(1) } });
}
async function eligibleEmail() { const t = await target({ hours: 200 }); await prior(t, 1, 49); return t; }

test.before(() => {
  globalThis.fetch = async () => { throw new Error('External requests prohibited in registration tests'); };
  apply('prisma/migrations/20260526120000_player_interest_response/migration.sql');
  apply('prisma/migrations/20260705193500_allow_general_player_interest_response/migration.sql');
  sql('ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "proposedStartDate" TIMESTAMP(3)');
  apply(migration);
});
test.beforeEach(() => {
  test.mock.timers.enable({ apis: ['Date'], now: baseNow });
  sql('TRUNCATE "NotificationDispatch", "NotificationRecipient", "MessageThread", "TeamPlayerProspect", "Team", "League", "User", "PlayerInterestResponse" CASCADE');
  process.env.CRON_SECRET = 'registration-test-only';
  delete process.env.MANAGED_SQUAD_REGISTRATION_REMINDERS_ENABLED;
  providerCalls = []; failProvider = false;
});
test.afterEach(() => test.mock.timers.reset());
test.after(async () => prisma.$disconnect());

test('policy spaces three stages and respects UK hours across both DST changes', () => {
  assert.deepEqual(policy.REGISTRATION_DELAYS, [24, 72, 168].map(h => h * H));
  assert.deepEqual(policy.REGISTRATION_GAPS, [0, 48, 96].map(h => h * H));
  for (const [input, expected] of [
    ['2026-09-08T07:59:59Z', '2026-09-08T08:00:00Z'], ['2026-09-08T08:00:00Z', '2026-09-08T08:00:00Z'],
    ['2026-09-08T20:00:00Z', '2026-09-09T08:00:00Z'], ['2026-03-28T21:00:00Z', '2026-03-29T08:00:00Z'],
    ['2026-10-24T20:00:00Z', '2026-10-25T09:00:00Z'], ['2026-12-01T08:00:00Z', '2026-12-01T09:00:00Z'],
  ]) assert.equal(policy.nextRegistrationWindow(new Date(input)).toISOString(), new Date(expected).toISOString());
});
test('first reminder requires a genuinely sent team-owned invite, and a full 24 hours', async () => {
  for (const inviteStatus of [null, 'QUEUED', 'FAILED', 'SKIPPED']) assert.equal(await queue(await target({ inviteStatus })), null);
  const t = await target({ hours: 24 }); assert.equal(await queue(t, new Date(baseNow.getTime() - 1)), null);
  const queued = await queue(t); assert.equal(queued.stage, 1); assert.equal(queued.dispatch.channel, 'SMS');
  assert.match(queued.dispatch.bodyText, /Test/); assert.equal(queued.dispatch.variables.teamName, t.team.name);
  assert.equal(queued.dispatch.variables.joinConfirmationUrl, invite.getManagedSquadJoinConfirmationUrl(t.prospect.id));
  assert.equal(await queue(t), null);
});
test('concurrent cron workers and database stage index allow exactly one outbox row', async () => {
  const t = await target();
  const results = await Promise.all(Array.from({ length: 4 }, () => queue(t)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await prisma.notificationDispatch.count({ where: { sourceType: SRC, sourceId: t.prospect.id } }), 1);
  await assert.rejects(() => prior(t, 1, 1), /Unique constraint/);
});
test('old invitation backlog sends one stage, waits for actual delivery then spaces later stages', async () => {
  const t = await target({ hours: 600 }); const one = await queue(t); assert.equal(one.stage, 1);
  assert.equal(await queue(t, new Date(baseNow.getTime() + 300 * H)), null, 'queued is not sent');
  await prisma.notificationDispatch.update({ where: { id: one.dispatch.id }, data: { status: 'SENT', sentAt: baseNow } });
  assert.equal(await queue(t, new Date(baseNow.getTime() + 48 * H - 1)), null);
  const two = await queue(t, new Date(baseNow.getTime() + 48 * H)); assert.equal(two.stage, 2); assert.equal(two.dispatch.channel, 'EMAIL');
  await prisma.notificationDispatch.update({ where: { id: two.dispatch.id }, data: { status: 'SENT', sentAt: new Date(baseNow.getTime() + 48 * H) } });
  assert.equal(await queue(t, new Date(baseNow.getTime() + 144 * H - 1)), null);
  const three = await queue(t, new Date(baseNow.getTime() + 144 * H)); assert.equal(three.stage, 3);
  await prisma.notificationDispatch.update({ where: { id: three.dispatch.id }, data: { status: 'SENT', sentAt: new Date(baseNow.getTime() + 144 * H) } });
  assert.equal(await queue(t, new Date(baseNow.getTime() + 900 * H)), null);
});
test('manual legacy chases consume the cap; a legacy final and uncertain attempts stop automation', async () => {
  const t = await target({ hours: 400 }); await prior(t, 1, 200, 'MANAGED_SQUAD_JOIN_CHASE'); await prior(t, 2, 100, 'MANAGED_SQUAD_JOIN_CHASE');
  assert.equal((await queue(t)).stage, 3);
  const final = await target({ hours: 400 }); await prior(final, 3, 100, 'MANAGED_SQUAD_JOIN_FINAL_CHASE'); assert.equal(await queue(final), null);
  for (const status of ['QUEUED', 'PROCESSING', 'FAILED', 'SKIPPED', 'CANCELLED']) {
    const t = await target({ hours: 400 }); await prior(t, 1, 200, SRC, status); assert.equal(await queue(t), null);
  }
});
test('one permitted channel per stage, with fallback and without restoring opt-outs', async () => {
  const noPhone = await target({ phone: false }); assert.equal((await queue(noPhone)).dispatch.channel, 'EMAIL');
  const smsOff = await target(); await prisma.notificationPreference.update({ where: { recipientId: smsOff.recipient.id }, data: { smsEnabled: false } });
  assert.equal((await queue(smsOff)).dispatch.channel, 'EMAIL');
  assert.equal((await prisma.notificationPreference.findUniqueOrThrow({ where: { recipientId: smsOff.recipient.id } })).smsEnabled, false);
  const emailOff = await eligibleEmail(); await prisma.notificationRecipient.update({ where: { id: emailOff.recipient.id }, data: { transactionalEmailOptIn: false } });
  assert.equal((await queue(emailOff)).dispatch.channel, 'SMS');
});
test('suppression and channel opt-outs on alternate contact records are respected', async () => {
  const t = await target();
  const alt = await prisma.notificationRecipient.create({ data: { sourceType: 'GENERAL', sourceId: randomUUID(), audience: 'PLAYER', email: ` ${t.prospect.email.toUpperCase()} `, phone: '+44' + t.prospect.phone.slice(1), isSuppressed: true } });
  assert.equal(await queue(t), null);
  await prisma.notificationRecipient.update({ where: { id: alt.id }, data: { isSuppressed: false, transactionalEmailOptIn: false, transactionalSmsOptIn: false } });
  assert.equal(await queue(t), null);
});
test('registered, declined, closed, unassigned, inactive and standard squads are excluded', async () => {
  for (const status of ['ACTIVE_SQUAD', 'DECLINED', 'CLOSED', 'QUALIFIED', 'INACTIVE']) assert.equal(await queue(await target({ status })), null);
  assert.equal(await queue(await target({ teamMode: 'STANDARD' })), null);
  assert.equal(await queue(await target({ activeLeague: false })), null);
  const t = await target(); await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { teamId: null } }); assert.equal(await queue(t), null);
});
test('existing membership and duplicate contact records are held, never merged or promoted', async () => {
  const t = await target(); const user = await prisma.user.create({ data: { name: 'Different Person', email: t.prospect.email } });
  await prisma.teamMember.create({ data: { teamId: t.team.id, userId: user.id, role: 'PLAYER' } }); assert.equal(await queue(t), null);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name, 'Different Person');
  const duplicate = await target(); const other = await target();
  await prisma.teamPlayerProspect.update({ where: { id: other.prospect.id }, data: { email: ` ${duplicate.prospect.email.toUpperCase()} ` } }); assert.equal(await queue(duplicate), null);
  await prisma.teamPlayerProspect.update({ where: { id: other.prospect.id }, data: { email: other.prospect.email, phone: '0044' + duplicate.prospect.phone.slice(1) } }); assert.equal(await queue(duplicate), null);
});
test('actual email/SMS replies and YES/NO responses pause, including archived threads; cached timestamps are not evidence', async () => {
  for (const channel of ['EMAIL', 'SMS']) { const t = await target(); await inbound(t, channel); assert.equal(await queue(t), null); }
  const cached = await target(); await inbound(cached, 'EMAIL', true); assert.ok(await queue(cached));
  for (const response of ['YES', 'NO']) {
    const t = await target(); await prisma.$executeRawUnsafe('INSERT INTO "PlayerInterestResponse" (id,"teamId","prospectId",response,"tokenHash","respondedAt") VALUES ($1,$2,$3,$4,$5,$6)', randomUUID(), t.team.id, t.prospect.id, response, randomUUID(), ago(1));
    assert.equal(await queue(t), null);
  }
});
test('all managed squads are scanned regardless of recruiting toggle, without changing identities', async () => {
  const a = await target(), b = await target(), standard = await target({ teamMode: 'STANDARD' });
  const before = await prisma.teamPlayerProspect.findMany({ orderBy: { id: 'asc' } });
  const summary = await service.runManagedSquadRegistrationReminderJob(baseNow);
  assert.equal(summary.queued, 2); assert.equal(summary.errors.length, 0);
  assert.equal(await prisma.notificationDispatch.count({ where: { sourceType: SRC, sourceId: standard.prospect.id } }), 0);
  assert.deepEqual(await prisma.teamPlayerProspect.findMany({ orderBy: { id: 'asc' } }), before);
  assert.equal(await prisma.user.count(), 0); assert.equal(await prisma.teamMember.count(), 0);
  assert.equal((await service.getRegistrationReminderOverview(a.team.id)).length, 1);
});
test('manual contact after queueing postpones the existing reminder, not a second message', async () => {
  const t = await target(); const q = await queue(t);
  await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { lastContactedAt: baseNow } });
  const d = await service.registrationDeliveryDecision(await get(q.dispatch.id), baseNow);
  assert.equal(d.deferUntil.toISOString(), new Date(baseNow.getTime() + 48 * H).toISOString());
  await processor.processNotificationQueue(100); assert.equal(providerCalls.length, 0);
  const saved = await get(q.dispatch.id); assert.equal(saved.status, 'QUEUED'); assert.equal(saved.scheduledFor.toISOString(), d.deferUntil.toISOString());
});
test('provider gate rechecks both channels after completion, replies, opt-out and allocation/contact changes', async () => {
  for (const channel of ['SMS', 'EMAIL']) for (const change of ['joined', 'declined', 'reply', 'optout', 'move', 'email', 'phone', 'link', 'template']) {
    const t = channel === 'EMAIL' ? await eligibleEmail() : await target(); const q = await queue(t); assert.equal(q.dispatch.channel, channel);
    if (change === 'joined' || change === 'declined') await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { status: change === 'joined' ? 'ACTIVE_SQUAD' : 'DECLINED' } });
    if (change === 'reply') await inbound(t);
    if (change === 'optout') await prisma.notificationRecipient.update({ where: { id: t.recipient.id }, data: { isSuppressed: true } });
    if (change === 'move') await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { teamId: null } });
    if (change === 'email') await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { email: 'changed@example.invalid' } });
    if (change === 'phone') {
      if (channel === 'SMS') await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { phone: '+447700900999' } });
      else await prisma.notificationPreference.update({ where: { recipientId: t.recipient.id }, data: { emailEnabled: false } });
    }
    if (change === 'link') await prisma.notificationDispatch.update({ where: { id: q.dispatch.id }, data: { variables: { joinConfirmationUrl: 'https://example.invalid/wrong' } } });
    if (change === 'template') await prisma.notificationTemplate.update({ where: { id: q.dispatch.templateId }, data: { isActive: false } });
    const before = providerCalls.length; await processor.processNotificationQueue(100);
    assert.equal(providerCalls.length, before, `${channel}/${change} must never reach provider`);
    assert.equal((await get(q.dispatch.id)).status, 'CANCELLED', `${channel}/${change}`);
    if (change === 'template') await prisma.notificationTemplate.update({ where: { id: q.dispatch.templateId }, data: { isActive: true } });
  }
});
test('real processor sends eligible SMS and email once and records history', async () => {
  for (const channel of ['SMS', 'EMAIL']) {
    const t = channel === 'EMAIL' ? await eligibleEmail() : await target(); const q = await queue(t);
    const before = providerCalls.length; await processor.processNotificationQueue(100);
    assert.equal(providerCalls.length, before + 1); assert.equal(providerCalls.at(-1).channel, channel);
    const sent = await get(q.dispatch.id); assert.equal(sent.status, 'SENT'); assert.ok(sent.sentAt); assert.ok(sent.providerMessageId);
    await processor.processNotificationQueue(100); assert.equal(providerCalls.length, before + 1);
  }
});
test('failed sends require queue review, not endless automatic re-creation', async () => {
  const t = await target(); const q = await queue(t); failProvider = true; await processor.processNotificationQueue(100);
  assert.equal((await get(q.dispatch.id)).status, 'FAILED'); assert.equal(await queue(t, new Date(baseNow.getTime() + 240 * H)), null);
  assert.equal(providerCalls.length, 1);
});
test('late queue delivery defers both channels overnight and disabling automation cancels unsent reminders', async () => {
  for (const channel of ['SMS', 'EMAIL']) {
    const t = channel === 'EMAIL' ? await eligibleEmail() : await target(); const q = await queue(t);
    test.mock.timers.setTime(new Date('2026-09-08T20:00:00Z'));
    await processor.processNotificationQueue(100); assert.equal(providerCalls.length, 0);
    assert.equal((await get(q.dispatch.id)).scheduledFor.toISOString(), '2026-09-09T08:00:00.000Z');
    test.mock.timers.setTime(baseNow);
  }
  const t = await target(); const q = await queue(t); process.env.MANAGED_SQUAD_REGISTRATION_REMINDERS_ENABLED = 'false';
  await processor.processNotificationQueue(100); assert.equal((await get(q.dispatch.id)).status, 'CANCELLED');
  assert.equal(providerCalls.length, 0); assert.equal((await service.runManagedSquadRegistrationReminderJob()).queued, 0);
});
test('template migrations preserve administrator copy and inactive settings; no hard-coded automatic message bodies', async () => {
  const key = policy.registrationTemplateKey(1, 'SMS'); const old = await prisma.notificationTemplate.findUniqueOrThrow({ where: { key } });
  try {
    await prisma.notificationTemplate.update({ where: { key }, data: { body: 'Edited reminder for {{firstName}}: {{joinConfirmationUrl}}' } }); apply(migration);
    const t = await target(); assert.match((await queue(t)).dispatch.bodyText, /Edited reminder/);
    await prisma.notificationTemplate.update({ where: { key }, data: { isActive: false } }); apply(migration);
    assert.equal(await queue(await target()), null);
  } finally { await prisma.notificationTemplate.update({ where: { key }, data: { body: old.body, isActive: old.isActive } }); }
  assert.doesNotMatch(read('src/lib/managed-squad/registration-reminders.ts'), /queueDirectNotification|Hi \{\{/);
});
test('read-only native panel separates queued from sent; entry points retain guards and prior jobs', () => {
  const { RegistrationReminderTable } = load('src/components/managed-squad/RegistrationReminderPanel.tsx');
  const html = renderToStaticMarkup(React.createElement(RegistrationReminderTable, { enabled: true, rows: [{ id: 'x', name: 'Test Player', inviteSentAt: ago(25), plan: { state: 'queued', note: 'Reminder queued, not yet sent.', dueAt: baseNow }, history: [{ id: 'a', channel: 'SMS', status: 'QUEUED', sentAt: null, scheduledFor: baseNow }] }] }));
  assert.match(html, /Automatic registration reminders/); assert.match(html, /Queued for/); assert.match(html, /not sent/);
  const code = read('src/lib/notifications/processor.ts');
  assert.equal((code.match(/await applyRegistrationDeliveryGate\(dispatch\)/g) || []).length, 2);
  assert.match(read('src/app/api/cron/notifications/route.ts'), /runManagedSquadRegistrationReminderJob/);
  assert.match(read('src/app/api/cron/notifications/route.ts'), /processNotificationQueue\(100\)/);
  assert.match(read('src/app/(admin)/admin/teams/[id]/prospects/layout.tsx'), /await requireAdmin\(\)/);
  assert.match(read('src/app/captain/team/[teamid]/prospects/layout.tsx'), /await requireCaptain\(teamid\)/);
});
