const assert = require('node:assert/strict');
const { test, before, beforeEach, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const rawUrl = process.env.LEAD_DECLINE_TEST_DATABASE_URL;
if (!rawUrl || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(rawUrl).hostname)) throw new Error('An isolated localhost test database is required');
const schema = 'lead_decline_' + randomUUID().replaceAll('-', '');
const url = new URL(rawUrl); url.searchParams.set('schema', schema);
const rootDb = new PrismaClient({ datasources: { db: { url: rawUrl } } });
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
process.env.NEXTAUTH_SECRET = 'isolated-test-secret-not-production';
function loadTs(file, mocks = {}) {
  const filename = path.isAbsolute(file) ? file : path.join(root, file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = instance.require.bind(instance);
  instance.require = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === '@/lib/prisma') return { prisma: db };
    const target = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
    if (target) for (const extension of ['.ts', '.tsx']) if (fs.existsSync(target + extension)) return loadTs(target + extension, mocks);
    return native(name);
  };
  instance._compile(compiled, filename); return instance.exports;
}
const policy = loadTs('src/lib/leads/team-lead-chase-policy.ts');
const chases = loadTs('src/lib/leads/team-lead-chases.ts');
const confirmation = loadTs('src/lib/leads/teamPlaceConfirmation.ts');
const source = 'LEAD_TEAM_CONFIRMATION_SMS_NUDGE_FINAL';
const reference = { sourceType: source, sourceId: 'lead-a' };
before(async () => {
  await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const statements = [
    `CREATE TYPE "LeadTeamConfirmationStatus" AS ENUM ('PENDING','CONFIRMED','DECLINED')`,
    `CREATE TABLE "InterestLead" ("id" TEXT PRIMARY KEY, "interestType" TEXT, "convertedTeamId" TEXT, "status" TEXT, "closedAt" TIMESTAMP(3), "message" TEXT, "createdAt" TIMESTAMP(3) DEFAULT NOW(), "updatedAt" TIMESTAMP(3) DEFAULT NOW())`,
    `CREATE TABLE "LeadTeamConfirmation" ("id" TEXT PRIMARY KEY, "leadId" TEXT UNIQUE REFERENCES "InterestLead"("id"), "token" TEXT UNIQUE, "status" "LeadTeamConfirmationStatus", "sentAt" TIMESTAMP(3), "declinedAt" TIMESTAMP(3), "confirmedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3))`,
    `CREATE TABLE "NotificationTemplate" ("id" TEXT PRIMARY KEY, "key" TEXT, "ctaUrlKey" TEXT)`,
    `CREATE TABLE "NotificationDispatch" ("id" TEXT PRIMARY KEY, "sourceId" TEXT, "sourceType" TEXT, "templateId" TEXT, "metadata" JSONB, "status" TEXT DEFAULT 'QUEUED', "sentAt" TIMESTAMP(3), "providerMessageId" TEXT, "cancelledAt" TIMESTAMP(3), "failureReason" TEXT, "updatedAt" TIMESTAMP(3) DEFAULT NOW(), "scheduledFor" TIMESTAMP(3) DEFAULT NOW())`,
    `CREATE TABLE "NotificationAttempt" ("id" TEXT PRIMARY KEY, "dispatchId" TEXT, "status" TEXT)`,
    `CREATE TABLE "MessageEntry" ("id" TEXT PRIMARY KEY, "notificationDispatchId" TEXT, "direction" TEXT, "sentAt" TIMESTAMP(3), "providerMessageId" TEXT, "providerStatus" TEXT, "body" TEXT DEFAULT 'Preserve original message', "updatedAt" TIMESTAMP(3) DEFAULT NOW())`,
  ];
  for (const statement of statements) await db.$executeRawUnsafe(statement);
});
after(async () => { await db.$disconnect(); await rootDb.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); await rootDb.$disconnect(); });
beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "InterestLead", "LeadTeamConfirmation", "NotificationDispatch", "NotificationAttempt", "MessageEntry", "NotificationTemplate" CASCADE');
  await db.$executeRaw`INSERT INTO "InterestLead" ("id", "interestType", "status", "message") VALUES ('lead-a','TEAM','CONTACTED','Existing enquiry and notes'), ('lead-b','TEAM','CONTACTED','Other enquiry'), ('player-a','PLAYER','NEW','Player')`;
});
async function dispatch(id, overrides = {}) {
  const row = { sourceType: source, sourceId: 'lead-a', status: 'QUEUED', templateId: null, metadata: null, sentAt: null, providerMessageId: null, ...overrides };
  await db.$executeRaw`INSERT INTO "NotificationDispatch" ("id", "sourceType", "sourceId", "status", "templateId", "metadata", "sentAt", "providerMessageId", "scheduledFor") VALUES (${id}, ${row.sourceType}, ${row.sourceId}, ${row.status}, ${row.templateId}, ${JSON.stringify(row.metadata)}::jsonb, ${row.sentAt}, ${row.providerMessageId}, NOW() + INTERVAL '1 day')`;
}
async function readLead(id = 'lead-a') { return (await db.$queryRaw`SELECT * FROM "InterestLead" WHERE "id" = ${id}`)[0]; }
async function readDispatch(id) { return (await db.$queryRaw`SELECT * FROM "NotificationDispatch" WHERE "id" = ${id}`)[0]; }
const decline = () => confirmation.declineTeamPlaceFromLead('lead-a', { actorUserId: 'admin-test', actorLabel: 'Test Admin', via: 'SMS', note: 'They are not entering a team.' });

test('decline stops queued SMS/email, records existing decision, closes lead and preserves history', async () => {
  for (const kind of policy.TEAM_LEAD_CHASE_SOURCES) await dispatch(kind, { sourceType: kind });
  await dispatch('other', { sourceId: 'lead-b' }); await dispatch('payment', { sourceType: 'PLAYER_MATCH_FEE_REQUEST' });
  await dispatch('inbox', { sourceType: 'LEAD', metadata: { origin: 'admin_inbox_reply' } });
  await db.$executeRaw`INSERT INTO "MessageEntry" ("id","notificationDispatchId","direction","providerStatus") VALUES ('queued-entry',${source},'OUTBOUND','QUEUED'),('reply',${source},'INBOUND','RECEIVED')`;
  const result = await decline();
  assert.equal(result.cancelledCount, policy.TEAM_LEAD_CHASE_SOURCES.length);
  assert.equal((await readLead()).status, 'CLOSED'); assert.ok((await readLead()).closedAt);
  assert.match((await readLead()).message, /Existing enquiry and notes[\s\S]*Test Admin \[admin admin-test\][\s\S]*Via SMS[\s\S]*not entering/);
  const decision = await confirmation.getTeamPlaceConfirmationStatus('lead-a');
  assert.equal(decision.status, 'DECLINED'); assert.equal(decision.sentAt, null);
  for (const id of ['other','payment','inbox']) assert.equal((await readDispatch(id)).status, 'QUEUED');
  const messages = await db.$queryRaw`SELECT * FROM "MessageEntry" ORDER BY "id"`;
  assert.equal(messages[0].providerStatus, 'CANCELLED'); assert.equal(messages[1].providerStatus, 'RECEIVED');
  assert.ok(messages.every(message => message.body === 'Preserve original message'));
});
test('repeated and concurrent decline clicks do not duplicate notes or replace the recorded date', async () => {
  await dispatch('one');
  const results = await Promise.all([decline(), decline()]);
  assert.deepEqual(results.map(row => row.alreadyDeclined).sort(), [false, true]);
  assert.equal(results[0].declinedAt, results[1].declinedAt);
  assert.equal((await readLead()).message.match(/registration chases stopped/g).length, 1);
});
test('keeps original sent history and does not fabricate a sent invitation', async () => {
  await confirmation.ensureTeamPlaceConfirmationRecord('lead-a');
  const prior = await confirmation.getTeamPlaceConfirmationStatus('lead-a');
  await decline(); const after = await confirmation.getTeamPlaceConfirmationStatus('lead-a');
  assert.equal(after.sentAt.toISOString(), prior.sentAt.toISOString());
  await assert.rejects(() => confirmation.ensureTeamPlaceConfirmationRecord('lead-a'), /stopped/);
  assert.equal((await confirmation.getTeamPlaceConfirmationStatus('lead-a')).status, 'DECLINED');
});
test('public secure-link decline uses the same cancellation without an invented admin actor', async () => {
  await dispatch('queued'); await confirmation.declineTeamPlaceFromLead('lead-a');
  assert.equal((await readDispatch('queued')).status, 'CANCELLED');
  assert.match((await readLead()).message, /Team contact \(secure decision link\)/);
});
test('wrong lead type, missing lead and converted team cannot be marked declined', async () => {
  await assert.rejects(() => confirmation.declineTeamPlaceFromLead('player-a'), /team enquiries/);
  await assert.rejects(() => confirmation.declineTeamPlaceFromLead('missing'), /not found/);
  await db.$executeRaw`UPDATE "InterestLead" SET "convertedTeamId" = 'team-a' WHERE "id" = 'lead-a'`;
  await assert.rejects(decline, /already become a team/);
  assert.equal((await readLead()).status, 'CONTACTED');
});
test('never relabels sent/provider-accepted messages, and reports in-flight processing', async () => {
  await dispatch('sent', { status: 'SENT', sentAt: new Date() });
  await dispatch('provider-id', { providerMessageId: 'synthetic-id' });
  await dispatch('attempt'); await db.$executeRaw`INSERT INTO "NotificationAttempt" VALUES ('a','attempt','SUCCESS')`;
  await dispatch('message-proof'); await db.$executeRaw`INSERT INTO "MessageEntry" ("id","notificationDispatchId","direction","sentAt") VALUES ('proof','message-proof','OUTBOUND',NOW())`;
  await dispatch('processing', { status: 'PROCESSING' }); await dispatch('failed', { status: 'FAILED' });
  const result = await decline(); assert.equal(result.cancelledCount, 1); assert.equal(result.processingCount, 1);
  assert.equal((await readDispatch('sent')).status, 'SENT'); assert.equal((await readDispatch('processing')).status, 'PROCESSING');
  for (const id of ['provider-id','attempt','message-proof']) assert.equal((await readDispatch(id)).status, 'QUEUED');
});
test('legacy template-based follow-ups are included but generic replies and other leads are not', async () => {
  await db.$executeRaw`INSERT INTO "NotificationTemplate" VALUES ('template-a','team-place-confirmation-email','teamConfirmationUrl')`;
  await dispatch('legacy', { sourceType: 'LEAD', templateId: 'template-a' });
  await dispatch('meta', { sourceType: 'LEAD', metadata: { ctaUrl: 'https://example.test/team-confirmation/test-only' } });
  await dispatch('general', { sourceType: 'LEAD' });
  const result = await decline(); assert.equal(result.cancelledCount, 2);
  assert.equal((await readDispatch('general')).status, 'QUEUED');
});
test('delivery gate rereads a decision after the worker has already claimed its snapshot', async () => {
  await dispatch('claimed', { status: 'PROCESSING' });
  assert.equal(await chases.getTeamLeadChaseBlockReason(reference), null);
  await decline(); assert.equal(await chases.applyTeamLeadChaseDeliveryGate({ ...reference, id: 'claimed' }), policy.TEAM_LEAD_STOP_REASON);
  assert.equal((await readDispatch('claimed')).status, 'CANCELLED');
});
test('closed or declined blocks stale enqueue, even if a general lead edit changed the status', async () => {
  await decline(); await db.$executeRaw`UPDATE "InterestLead" SET "status" = 'NEW' WHERE "id" = 'lead-a'`;
  assert.equal(await chases.getTeamLeadChaseBlockReason(reference), policy.TEAM_LEAD_STOP_REASON);
  await db.$executeRaw`UPDATE "InterestLead" SET "status" = 'CLOSED' WHERE "id" = 'lead-b'`;
  assert.equal(await chases.getTeamLeadChaseBlockReason({ ...reference, sourceId: 'lead-b' }), policy.TEAM_LEAD_STOP_REASON);
  assert.equal(await chases.getTeamLeadChaseBlockReason({ sourceType: 'ANNOUNCEMENT', sourceId: 'lead-a' }), null);
});
test('normal cleanup catches a stale future queue created after decline without sending anything', async () => {
  await decline(); await dispatch('late'); await dispatch('other', { sourceId: 'lead-b' });
  assert.equal(await chases.cancelStoppedTeamLeadChases(), 1);
  assert.equal((await readDispatch('late')).status, 'CANCELLED'); assert.equal((await readDispatch('other')).status, 'QUEUED');
});

for (const channel of ['EMAIL', 'SMS']) test('actual processor stops declined ' + channel + ' before the provider', async () => {
  await dispatch('worker', { status: 'PROCESSING' }); await decline();
  let sent = 0;
  const processor = loadTs('src/lib/notifications/processor.ts', {
    './service': { getDueNotificationDispatches: async () => [{ ...reference, id: 'worker', channel, recipientId: 'recipient', recipient: { email: 'test@example.test', phone: '+447700900123' }, subject: 'Isolated test', bodyText: 'Isolated test', bodyHtml: '<p>Isolated test</p>', metadata: {}, createdAt: new Date() }], markNotificationDispatchProcessing: async () => true, markNotificationDispatchFailed: async () => assert.fail('Unexpected failure before tested gate'), markNotificationDispatchSent: async () => {}, markNotificationDispatchCancelled: async () => {} },
    '@/lib/managed-squad/registration-reminders': { applyRegistrationDeliveryGate: async () => null },
    '@/lib/fixtures/replacement-sms-lifecycle': { getReplacementSmsCancellationReason: async () => null, cancelOwnedReplacementSms: async () => {} },
    '@/lib/fixtures/publishing': { getUnpublishedFixtureBlockReason: async () => null },
    '@/lib/messaging/service': { findOrCreateEmailThreadForOutbound: async () => ({ replyAddress: 'test@example.test' }), linkDispatchToThread: async () => {} },
    '@/lib/payments/charge-status': {},
    '@/lib/squad/activation-emails': { getSquadActivationEmailDeliveryBlock: async () => null },
    '@/lib/player-pool/profile-sms-reminders': { getPlayerPoolProfileSmsDeliveryBlock: async () => null },
    '@/lib/referees/evening-notifications': { refereeEveningDeliveryBlock: async () => null },
    '@/lib/referees/evening-policy': { isLegacyRefereeNotice: () => false },
    './providers/resend': { sendEmailWithResend: async () => { sent++; return {}; } },
    './providers/twilio': { sendSmsWithTwilio: async () => { sent++; return {}; } },
  });
  const result = await processor.processNotificationQueue();
  assert.equal(sent, 0); assert.equal(result.skipped, 1); assert.equal((await readDispatch('worker')).status, 'CANCELLED');
});

test('admin API authenticates, checks same origin and stores the trusted admin, not a supplied actor', async () => {
  const { NextRequest } = require('next/server');
  const route = loadTs('src/app/api/admin/leads/[leadId]/decision/route.ts', {
    '@/lib/requireAdmin': { requireAdmin: async () => ({ user: { id: 'trusted-admin', name: 'Admin' } }) },
    'next/cache': { revalidatePath: () => {} },
  });
  const request = (origin = 'https://example.test', body = {}) => new NextRequest('https://example.test/api/admin/leads/lead-a/decision', { method: 'POST', headers: { origin, 'X-SIXFL-Lead-Decision': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'DECLINED', via: 'SMS', note: 'Not joining', actorUserId: 'forged', ...body }) });
  const context = { params: Promise.resolve({ leadId: 'lead-a' }) };
  assert.equal((await route.POST(request('https://other.test'), context)).status, 403);
  assert.equal((await readLead()).status, 'CONTACTED');
  assert.equal((await route.POST(request(undefined, { via: 'UNKNOWN' }), context)).status, 400);
  const result = await route.POST(request(), context); assert.equal(result.status, 200);
  assert.match((await readLead()).message, /trusted-admin/); assert.doesNotMatch((await readLead()).message, /forged/);
  const unauthorized = loadTs('src/app/api/admin/leads/[leadId]/decision/route.ts', { '@/lib/requireAdmin': { requireAdmin: async () => ({ user: null }) }, 'next/cache': { revalidatePath: () => {} } });
  assert.equal((await unauthorized.POST(request(), context)).status, 403);
});

test('native control has an explicit action and shows stopped status without a sending control', () => {
  const component = loadTs('src/components/admin/leads/TeamLeadDecisionControls.tsx', { 'next/navigation': { useRouter: () => ({ refresh() {} }) } }).default;
  const open = renderToStaticMarkup(React.createElement(component, { leadId: 'lead-a', leadName: 'Test enquiry' }));
  assert.match(open, /Not interested — stop chasing/);
  const stopped = renderToStaticMarkup(React.createElement(component, { leadId: 'lead-a', leadName: 'Test enquiry', declined: true, declinedAt: '2026-09-08T09:00:00Z' }));
  assert.match(stopped, /Not interested — chases stopped/); assert.doesNotMatch(stopped, /<button/);
});
test('prepared source connects list/detail, both queue entrances, both providers and public decline', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('src/app/(admin)/admin/leads/page.tsx'), /<TeamLeadDecisionControls/);
  assert.match(read('src/app/(admin)/admin/leads/[id]/layout.tsx'), /<TeamLeadDecisionPanel/);
  assert.equal((read('src/lib/notifications/service.ts').match(/await getTeamLeadChaseBlockReason\(/g) || []).length, 2);
  assert.equal((read('src/lib/notifications/processor.ts').match(/await applyTeamLeadChaseDeliveryGate\(dispatch\)/g) || []).length, 2);
  assert.match(read('src/lib/leads/teamPlaceConfirmation.ts'), /return recordTeamLeadDecline/);
  assert.match(read('src/lib/leads/team-confirmation-sms-reminders.ts'), /confirmation\."status"::text = 'PENDING'/);
  assert.match(read('src/app/api/admin/leads/team-confirmation-sms-status/route.ts'), /Not interested — registration chases stopped/);
  assert.equal(fs.existsSync(path.join(root, 'scripts/prepare-lead-decline-branch.cjs')), false);
});


for (const channel of ['EMAIL', 'SMS']) for (const mode of ['template', 'direct']) {
  test('actual ' + mode + ' queue blocks declined ' + channel + ' and preserves normal recipient checks', async () => {
    const created = [];
    const recipient = {
      id: 'synthetic-recipient', email: 'test@example.test', phone: '+447700900123',
      isSuppressed: false, transactionalEmailOptIn: true, transactionalSmsOptIn: true,
      marketingEmailOptIn: false, marketingSmsOptIn: false,
      preferences: { emailEnabled: true, smsEnabled: true, marketingEmailEnabled: false, marketingSmsEnabled: false },
    };
    const template = { id: 'synthetic-template', key: 'team-place-confirmation-email', kind: 'TRANSACTIONAL', channel, audience: 'LEAD', subject: 'Isolated test', body: 'Isolated registration request', isActive: true, ctaLabel: null, ctaUrlKey: null };
    const runtimeDb = {
      $queryRaw: query => db.$queryRaw(query),
      notificationTemplate: { findUnique: async () => template },
      notificationRecipient: { findUnique: async () => recipient },
      notificationDispatch: { create: async ({data}) => { const row = { id: 'created-' + created.length, ...data }; created.push(row); return row; } },
    };
    const service = loadTs('src/lib/notifications/service.ts', {
      '@/lib/prisma': { prisma: runtimeDb },
      './recipients': { getNotificationRecipientById: async () => recipient },
      '@/lib/fixtures/publishing': { getUnpublishedFixtureBlockReason: async () => null },
      '@/lib/fixtures/replacement-sms-lifecycle': { getReplacementSmsCancellationReason: async () => null },
      '@/lib/referees/evening-policy': { isLegacyRefereeNotice: () => false },
      '@/lib/resend/client': { getEmailReplyDomain: () => 'example.test' },
    });
    const queue = () => mode === 'template'
      ? service.queueNotificationFromTemplate({ ...reference, recipientId: recipient.id, templateKey: template.key })
      : service.queueDirectNotification({ ...reference, recipientId: recipient.id, channel, audience: 'LEAD', subject: template.subject, body: template.body });
    recipient.isSuppressed = true;
    assert.equal((await queue()).status, 'SKIPPED');
    recipient.isSuppressed = false;
    assert.equal((await queue()).status, 'QUEUED');
    await decline();
    const stopped = await queue();
    assert.equal(stopped.status, 'CANCELLED');
    assert.equal(stopped.failureReason, policy.TEAM_LEAD_STOP_REASON);
    assert.equal(created.length, 3);
  });
}
