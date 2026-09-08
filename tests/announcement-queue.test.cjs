const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');

const url = new URL(process.env.ANNOUNCEMENT_TEST_DATABASE_URL || 'http://missing');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.includes('announcement_test')) throw new Error('Only the isolated localhost announcement test database is allowed');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const root = path.resolve(__dirname, '..');
const cache = new Map();
const unexpected = () => { throw new Error('No delivery provider or network request may run in announcement tests'); };
let authorised = true;
const actor = 'announcement-admin';
const replacements = {
  '@/lib/prisma': { prisma: db },
  '@/lib/stripe/client': { getPublicSiteUrl: () => 'https://app.example.test' },
  '@/lib/requireAdmin': { requireAdmin: async () => { if (!authorised) throw new Error('NOTADMIN'); return { user: { id: actor } }; } },
  'next/dist/client/components/redirect-error': { isRedirectError: error => error?.message === 'NOTADMIN' },
  '@/lib/fixtures/publishing': { getUnpublishedFixtureBlockReason: async () => null },
  '@/lib/fixtures/replacement-sms-lifecycle': { cancelClosedReplacementSms: async () => 0, getReplacementSmsCancellationReason: async () => null },
  '@/lib/notifications/processor': new Proxy({}, { get: unexpected }),
  'server-only': {},
};
function load(file) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const instance = new Module(filename, module);
  instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, instance);
  const native = instance.require.bind(instance);
  instance.require = name => {
    if (Object.hasOwn(replacements, name)) return replacements[name];
    let local = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
    if (local) {
      for (const candidate of [local, local + '.ts', local + '.tsx']) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && /\.tsx?$/.test(candidate)) return load(candidate);
      }
    }
    return native(name);
  };
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
  return instance.exports;
}
process.env.EMAIL_REPLY_DOMAIN = 'reply.example.test';
const oldFetch = global.fetch;
global.fetch = unexpected;
const announcements = load('src/lib/communications/system-announcements.ts');
const queue = load('src/lib/communications/announcement-queue.ts');
const service = load('src/lib/notifications/service.ts');
const recipients = load('src/lib/notifications/recipients.ts');
const route = load('src/app/api/admin/announcements/route.ts');
const { NextRequest } = require('next/server');
let template, person, recipient, review;
async function makeRecipient(id, email, suppressed = false) {
  const item = await recipients.upsertNotificationRecipient({ sourceType: 'GENERAL', sourceId: id, audience: 'GENERAL', displayName: 'Example Contact', email, transactionalEmailOptIn: true, marketingEmailOptIn: false });
  if (suppressed) await db.notificationRecipient.update({ where: { id: item.id }, data: { isSuppressed: true } });
  return item;
}
before(async () => { await db.$connect(); });
after(async () => { global.fetch = oldFetch; await db.$disconnect(); });
beforeEach(async () => {
  authorised = true;
  await db.notificationDispatch.deleteMany();
  await db.notificationPreference.deleteMany();
  await db.notificationRecipient.deleteMany();
  await db.emailTemplate.deleteMany();
  await db.user.deleteMany();
  await db.user.create({ data: { id: actor, name: 'Test administrator', email: 'admin@example.test' } });
  await makeRecipient('admin-recipient', 'admin@example.test');
  recipient = await makeRecipient('recipient-one', 'one@example.test');
  person = { email: 'one@example.test', displayName: 'Example Contact' };
  template = await db.emailTemplate.create({ data: { key: 'announcement-example', name: 'Synthetic announcement', audience: 'GENERAL', subject: 'Referral example', body: 'Hello {{firstName}},\n\n*Example italic*\n\n{{cta}}', ctaLabel: 'Get my referral link', ctaUrlKey: 'referralPageUrl', isActive: true } });
  const audience = await announcements.getSystemAnnouncementAudience();
  review = { templateId: template.id, sourceId: announcements.getAnnouncementSourceId(template), audienceKey: queue.getAnnouncementAudienceKey(audience), confirmed: true, actorUserId: actor };
});
async function one() { return queue.queueAnnouncementRecipient({ person, template, sourceId: review.sourceId, actorUserId: actor }); }
async function count() { return db.notificationDispatch.count(); }
async function progress() { return (await queue.readAnnouncementStatus(review)).progress; }

test('same revision is not queued twice, even after a lost response or a recorded send', async () => {
  assert.equal(await one(), 'QUEUED');
  await db.notificationDispatch.updateMany({ data: { status: 'SENT', sentAt: new Date(), provider: 'isolated-test', providerMessageId: 'synthetic-provider-id' } });
  assert.equal(await one(), 'EXISTING');
  assert.equal(await count(), 1);
});
test('concurrent submissions create one durable queue row per normalized email', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, one));
  assert.equal(results.filter(x => x === 'QUEUED').length, 1);
  assert.equal(await count(), 1);
});
test('queue submission returns stored queue progress without sending to a provider', async () => {
  const result = await queue.queueSystemAnnouncement(review);
  assert.equal(result.queueFailures, 0);
  assert.equal(result.progress.remaining, 0);
  assert.equal(result.progress.queued, 2);
  assert.equal(result.progress.sent, 0);
  const row = await db.notificationDispatch.findFirst();
  assert.match(row.bodyHtml, /<em>Example italic<\/em>/);
  assert.match(row.bodyHtml, /https:\/\/www\.sixfl\.co\.uk\/player\/referrals/);
  assert.equal(row.providerMessageId, null);
});
test('duplicate accounts and recipient rows do not duplicate the audience or emails', async () => {
  await makeRecipient('recipient-copy', ' ONE@EXAMPLE.TEST ');
  assert.equal((await announcements.getSystemAnnouncementAudience()).length, 2);
  const result = await queue.queueSystemAnnouncement(review);
  assert.equal(result.progress.recorded, 2);
  assert.equal(await count(), 2);
});
test('suppression remains applied and the skipped outcome is not mistaken for sent', async () => {
  await db.notificationRecipient.update({ where: { id: recipient.id }, data: { isSuppressed: true } });
  assert.equal(await one(), 'SKIPPED');
  assert.equal(await one(), 'EXISTING');
  assert.equal((await progress()).skipped, 1);
  assert.equal((await progress()).sent, 0);
});
test('failed and cancelled records are review-only, not retried by queueing again', async () => {
  for (const status of ['FAILED', 'CANCELLED', 'PROCESSING']) {
    await db.notificationDispatch.deleteMany();
    await one();
    await db.notificationDispatch.updateMany({ data: { status } });
    assert.equal(await one(), 'EXISTING');
    assert.equal(await count(), 1);
    assert.equal((await progress())[status.toLowerCase()], 1);
  }
});
test('immutable email snapshot protects history when the account email is subsequently edited', async () => {
  await one();
  await db.notificationRecipient.update({ where: { id: recipient.id }, data: { email: 'new@example.test', emailNormalized: 'new@example.test' } });
  const records = await queue.getAnnouncementRecords(review.sourceId);
  assert.equal(records.get('one@example.test'), 'QUEUED');
  assert.equal(records.has('new@example.test'), false);
});
test('legacy announcement rows without a metadata snapshot are still recognised', async () => {
  await one();
  await db.notificationDispatch.updateMany({ data: { metadata: {}, status: 'SENT' } });
  assert.equal(await one(), 'EXISTING');
  assert.equal(await count(), 1);
});
test('a different announcement revision can still be explicitly queued', async () => {
  await one();
  const changed = { ...template, body: template.body + '\nA new announcement.' };
  const result = await queue.queueAnnouncementRecipient({ person, template: changed, sourceId: announcements.getAnnouncementSourceId(changed), actorUserId: actor });
  assert.equal(result, 'QUEUED');
  assert.equal(await count(), 2);
});
test('stale template and contact-list reviews are rejected before any queue write', async () => {
  await db.emailTemplate.update({ where: { id: template.id }, data: { subject: 'Changed while reviewing' } });
  await assert.rejects(queue.queueSystemAnnouncement(review), /changed/);
  assert.equal(await count(), 0);
  await db.emailTemplate.update({ where: { id: template.id }, data: { subject: template.subject } });
  await makeRecipient('new-contact', 'new@example.test');
  await assert.rejects(queue.queueSystemAnnouncement(review), /changed/);
  assert.equal(await count(), 0);
});
test('missing confirmation, malformed review and unsafe template are rejected', async () => {
  await assert.rejects(queue.queueSystemAnnouncement({ ...review, confirmed: false }), /Confirm/);
  await assert.rejects(queue.queueSystemAnnouncement({ ...review, sourceId: 'wrong' }), /Refresh/);
  template = await db.emailTemplate.update({ where: { id: template.id }, data: { body: '{{privateToken}}' } });
  await assert.rejects(queue.queueSystemAnnouncement({ ...review, sourceId: announcements.getAnnouncementSourceId(template) }), /recipient-specific/);
  assert.equal(await count(), 0);
});
test('direct queued and skipped writes participate in the caller transaction', async () => {
  for (const suppressed of [false, true]) {
    await db.notificationRecipient.update({ where: { id: recipient.id }, data: { isSuppressed: suppressed } });
    await assert.rejects(db.$transaction(async tx => {
      await service.queueDirectNotification({ recipientId: recipient.id, channel: 'EMAIL', audience: 'GENERAL', subject: 'Synthetic', body: 'Synthetic', isTransactional: true }, tx);
      throw new Error('ROLLBACK');
    }), /ROLLBACK/);
    assert.equal(await count(), 0);
  }
});
function req(method, data = review, headers = {}) {
  const query = new URLSearchParams({ templateId: review.templateId, sourceId: review.sourceId, audienceKey: review.audienceKey });
  return new NextRequest(`https://app.example.test/api/admin/announcements?${query}`, { method, ...(method === 'POST' ? { body: JSON.stringify(data), headers: { origin: 'https://app.example.test', 'content-type': 'application/json', 'x-sixfl-announcement': '1', ...headers } } : {}) });
}
test('status GET is read-only and does not retry or restart an announcement', async () => {
  await one();
  const snapshot = JSON.stringify(await db.notificationDispatch.findMany());
  const response = await route.GET(req('GET'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).progress.queued, 1);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(JSON.stringify(await db.notificationDispatch.findMany()), snapshot);
});
test('admin API denies anonymous and cross-origin submissions and needs explicit consent', async () => {
  authorised = false;
  assert.equal((await route.GET(req('GET'))).status, 401);
  assert.equal((await route.POST(req('POST'))).status, 401);
  authorised = true;
  assert.equal((await route.POST(req('POST', review, { origin: 'https://evil.example.test' }))).status, 403);
  assert.equal((await route.POST(req('POST', { ...review, confirmed: false }))).status, 409);
  assert.equal(await count(), 0);
});
test('admin API pins actor identity, returns queued not delivered and handles duplicate POSTs', async () => {
  let response = await route.POST(req('POST', { ...review, actorUserId: 'untrusted-actor' }));
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.progress.queued, 2); assert.equal(payload.progress.sent, 0);
  response = await route.POST(req('POST'));
  assert.equal(response.status, 200);
  assert.equal(await count(), 2);
  for (const row of await db.notificationDispatch.findMany()) assert.equal(row.createdByUserId, actor);
});
test('native submission paths do not call the delivery processor or reintroduce a raw action form', () => {
  for (const file of ['src/lib/communications/announcement-queue.ts', 'src/app/api/admin/announcements/route.ts', 'src/app/(admin)/admin/messaging/announcements/actions.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /processNotificationQueue|sendEmailWithResend|resend\.emails\.send/);
  }
  const page = fs.readFileSync(path.join(root, 'src/app/(admin)/admin/messaging/announcements/page.tsx'), 'utf8');
  assert.match(page, /<AnnouncementSendPanel/); assert.doesNotMatch(page, /<form action=\{sendSystemAnnouncementAction\}/);
});
