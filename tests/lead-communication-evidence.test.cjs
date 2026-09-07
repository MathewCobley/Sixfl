const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PrismaClient, Prisma } = require('@prisma/client');

const rawUrl = process.env.LEAD_EVIDENCE_TEST_DATABASE_URL;
if (!rawUrl) throw new Error('An isolated local test database is required');
const url = new URL(rawUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Tests only run on localhost, never production');
const schema = `lead_evidence_${randomUUID().replaceAll('-', '')}`;
const rootDb = new PrismaClient({ datasources: { db: { url: rawUrl } } });
url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const root = path.resolve(__dirname, '..');
function loadTs(file, replacements = {}) {
  const filename = path.join(root, file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename,
  }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = instance.require.bind(instance);
  instance.require = (name) => Object.hasOwn(replacements, name) ? replacements[name] : native(name);
  instance._compile(compiled, filename);
  return instance.exports;
}
const phone = loadTs('src/lib/messaging/phone.ts');
const evidenceLib = loadTs('src/lib/leads/communication-evidence.ts', {
  '@/lib/prisma': { prisma: db }, '@/lib/messaging/phone': phone,
});
const { loadLeadCommunicationEvidence, leadReplyState, leadConversationHref, emptyLeadEvidence } = evidenceLib;
const at = new Date('2026-09-03T10:00:00Z');
const beforeReply = new Date('2026-09-01T10:00:00Z');
const later = new Date('2026-09-04T10:00:00Z');

before(async () => {
  await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const ddl = [
    'CREATE TABLE "InterestLead" ("id" TEXT PRIMARY KEY, "email" TEXT, "phone" TEXT)',
    'CREATE TABLE "NotificationRecipient" ("id" TEXT PRIMARY KEY, "sourceType" TEXT, "sourceId" TEXT, "email" TEXT, "phone" TEXT)',
    'CREATE TABLE "MessageThread" ("id" TEXT PRIMARY KEY, "sourceType" TEXT, "sourceId" TEXT, "teamId" TEXT, "recipientId" TEXT, "latestInboundAt" TIMESTAMP(3), "status" TEXT DEFAULT \'OPEN\')',
    'CREATE TABLE "MessageEntry" ("id" TEXT PRIMARY KEY, "threadId" TEXT NOT NULL, "direction" TEXT, "participantRole" TEXT, "channel" TEXT, "receivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3), "subject" TEXT, "textBody" TEXT, "body" TEXT, "htmlBody" TEXT, "fromEmail" TEXT, "fromNumber" TEXT)',
  ];
  for (const sql of ddl) await db.$executeRawUnsafe(sql);
});
after(async () => {
  await db.$disconnect();
  await rootDb.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await rootDb.$disconnect();
});
beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "MessageEntry", "MessageThread", "NotificationRecipient", "InterestLead"');
  await db.$executeRaw`INSERT INTO "InterestLead" VALUES ('lead-a', 'alex@example.test', '07700 900123'), ('lead-b', 'other@example.test', '07700 900123')`;
  await db.$executeRaw`INSERT INTO "NotificationRecipient" VALUES ('recipient-a', 'LEAD', 'lead-a', 'alex@example.test', '+447700900123'), ('recipient-b', 'LEAD', 'lead-b', 'other@example.test', '+447700900123')`;
});
async function thread(overrides = {}) {
  const row = { id: 'legacy', sourceType: 'LEAD_TEAM_CONFIRMATION_SMS_NUDGE_1', sourceId: 'lead-a', teamId: null, recipientId: 'recipient-a', latestInboundAt: at, status: 'ARCHIVED', ...overrides };
  await db.$executeRaw`INSERT INTO "MessageThread" ("id", "sourceType", "sourceId", "teamId", "recipientId", "latestInboundAt", "status") VALUES (${row.id}, ${row.sourceType}, ${row.sourceId}, ${row.teamId}, ${row.recipientId}, ${row.latestInboundAt}, ${row.status})`;
}
async function message(overrides = {}) {
  const row = { id: 'incoming-a', threadId: 'legacy', direction: 'INBOUND', participantRole: 'CONTACT', channel: 'SMS', receivedAt: at, createdAt: at, subject: null, textBody: 'Where do we play, and what is the team fee?', body: '', htmlBody: null, fromEmail: null, fromNumber: '+447700900123', ...overrides };
  await db.$executeRaw`INSERT INTO "MessageEntry" ("id", "threadId", "direction", "participantRole", "channel", "receivedAt", "createdAt", "subject", "textBody", "body", "htmlBody", "fromEmail", "fromNumber") VALUES (${row.id}, ${row.threadId}, ${row.direction}, ${row.participantRole}, ${row.channel}, ${row.receivedAt}, ${row.createdAt}, ${row.subject}, ${row.textBody}, ${row.body}, ${row.htmlBody}, ${row.fromEmail}, ${row.fromNumber})`;
}
async function read() { return (await loadLeadCommunicationEvidence(['lead-a'], db)).get('lead-a'); }
async function fixture() { await thread(); await message(); }

test('legacy automation reply is visible even after newer outbound messages and archiving', async () => {
  await fixture();
  await message({ id: 'new-outbound', direction: 'OUTBOUND', receivedAt: null, createdAt: later, textBody: 'This is our outgoing chase, not their reply.' });
  const result = await read();
  assert.deepEqual(result.threadIds, ['legacy']);
  assert.equal(result.latestReply.id, 'incoming-a');
  assert.equal(result.latestReply.body, 'Where do we play, and what is the team fee?');
  assert.equal(result.latestReply.occurredAt.toISOString(), at.toISOString());
  assert.equal(leadReplyState(result, beforeReply), 'received');
  assert.equal(result.reviewAt, null);
});
test('recipient-linked generic conversation resolves even without a lead source ID', async () => {
  await thread({ sourceType: 'GENERAL', sourceId: null }); await message();
  assert.equal((await read()).latestReply.id, 'incoming-a');
});
test('outbound sent text alone never proves a reply', async () => {
  await thread({ latestInboundAt: null }); await message({ direction: 'OUTBOUND', receivedAt: null });
  const result = await read();
  assert.equal(result.latestReply, null); assert.equal(result.automationHoldAt, null); assert.equal(leadReplyState(result, beforeReply), 'none');
});
test('orphan incoming timestamp is review-only and cannot restart the chase', async () => {
  await thread(); const result = await read();
  assert.equal(result.latestReply, null); assert.equal(leadReplyState(result, beforeReply), 'review');
  assert.equal(result.automationHoldAt.toISOString(), at.toISOString()); assert.deepEqual(result.reviewThreadIds, ['legacy']);
});
test('unsupported newer timestamp retains hold without claiming another reply', async () => {
  await thread({ latestInboundAt: later }); await message(); const result = await read();
  assert.equal(leadReplyState(result, beforeReply), 'review');
  assert.equal(result.latestReply.occurredAt.toISOString(), at.toISOString());
  assert.equal(result.automationHoldAt.toISOString(), later.toISOString());
});
test('a real reply is found even when denormalized timestamp is absent', async () => {
  await thread({ latestInboundAt: null }); await message(); assert.equal(leadReplyState(await read(), beforeReply), 'received');
});
test('shared phone does not pull in another lead conversation', async () => {
  await thread({ sourceId: 'lead-b', recipientId: 'recipient-b' }); await message();
  assert.deepEqual(await read(), emptyLeadEvidence());
});
test('conflicting lead binding is review-only, not merged or presented as this lead reply', async () => {
  await thread({ sourceType: 'LEAD', sourceId: 'lead-b' }); await message(); const result = await read();
  assert.deepEqual(result.threadIds, []); assert.equal(result.latestReply, null); assert.equal(leadReplyState(result, beforeReply), 'review');
});
test('another team conversation cannot be accepted merely through the recipient record', async () => {
  await thread({ sourceType: 'TEAM', sourceId: 'team-b', teamId: 'team-b' }); await message();
  assert.equal((await read()).latestReply, null); assert.deepEqual((await read()).threadIds, []);
});
test('wrong sender or empty message cannot substantiate reply received', async () => {
  await thread(); await message({ fromNumber: '+447700900999' });
  assert.equal(leadReplyState(await read(), beforeReply), 'review');
  await db.$executeRaw`UPDATE "MessageEntry" SET "fromNumber" = '+447700900123', "textBody" = '', "body" = ''`;
  assert.equal(leadReplyState(await read(), beforeReply), 'review');
});
test('actual email reply accepts normalized sender and uses received time', async () => {
  await thread({ sourceType: 'LEAD_REASSURANCE_EMAIL' });
  await message({ channel: 'EMAIL', fromNumber: null, fromEmail: ' ALEX@EXAMPLE.TEST ', subject: 'Re: league', receivedAt: at, createdAt: beforeReply });
  const result = await read(); assert.equal(result.latestReply.channel, 'EMAIL'); assert.equal(leadReplyState(result, beforeReply), 'received');
});
test('historical owned recipient contact supports a changed lead email', async () => {
  await thread(); await message({ channel: 'EMAIL', fromNumber: null, fromEmail: 'alex@example.test' });
  await db.$executeRaw`UPDATE "InterestLead" SET "email" = 'new@example.test' WHERE "id" = 'lead-a'`;
  assert.equal(leadReplyState(await read(), beforeReply), 'received');
});
test('system entry and old reply cannot masquerade as a new contact reply', async () => {
  await fixture(); assert.equal(leadReplyState(await read(), later), 'none');
  await db.$executeRaw`UPDATE "MessageEntry" SET "participantRole" = 'SYSTEM'`;
  assert.equal((await read()).latestReply, null); assert.equal(leadReplyState(await read(), beforeReply), 'review');
});
test('reply lookup is not limited by the inbox or timeline page sizes', async () => {
  await fixture();
  await db.$executeRaw`INSERT INTO "MessageEntry" ("id", "threadId", "direction", "participantRole", "channel", "createdAt", "body") SELECT 'out-' || n, 'legacy', 'OUTBOUND', 'SYSTEM', 'SMS', ${later}, 'sent reminder' FROM generate_series(1,150) n`;
  assert.equal((await read()).latestReply.id, 'incoming-a');
});
test('resolver is read only and deduplicates repeated lead IDs', async () => {
  await fixture();
  const snapshot = async () => JSON.stringify(await db.$queryRaw`SELECT (SELECT jsonb_agg(t) FROM "MessageThread" t) AS threads, (SELECT jsonb_agg(m) FROM "MessageEntry" m) AS messages`);
  const initial = await snapshot(); const result = await loadLeadCommunicationEvidence(['lead-a', 'lead-a'], db);
  assert.equal(result.size, 1); assert.equal(await snapshot(), initial);
});

const Anchor = ({ href, children, ...rest }) => React.createElement('a', { ...rest, href }, children);
const Preview = ({ html }) => React.createElement('iframe', { sandbox: '', srcDoc: html });
const ReplyPanel = loadTs('src/components/admin/leads/LeadReplyEvidence.tsx', {
  'next/link': { default: Anchor, __esModule: true },
  '@/components/admin/email/EmailHtmlPreview': { default: Preview, __esModule: true },
  '@/lib/leads/communication-evidence': evidenceLib,
}).default;
test('native reply panel shows message, direction, UK time and direct archived conversation link', async () => {
  await fixture(); const html = renderToStaticMarkup(React.createElement(ReplyPanel, { evidence: await read() }));
  assert.match(html, /Latest incoming reply/); assert.match(html, /Where do we play/); assert.match(html, /INBOUND/);
  assert.match(html, /03 Sept? 2026/); assert.match(html, /11:00/);
  assert.match(html, /filter=all&amp;thread=legacy/); assert.match(html, /View conversation/);
});
test('review panel does not invent an incoming reply or delivery evidence', async () => {
  await thread(); const html = renderToStaticMarkup(React.createElement(ReplyPanel, { evidence: await read() }));
  assert.match(html, /Reply record needs checking/); assert.doesNotMatch(html, /Latest incoming reply/);
  assert.match(html, /hold is preserved/); assert.match(html, /Review linked conversation/);
});
test('reply text and conversation IDs are escaped rather than executed', async () => {
  await thread(); await message({ textBody: '<script>alert(1)</script>' });
  const html = renderToStaticMarkup(React.createElement(ReplyPanel, { evidence: await read() }));
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
  assert.equal(leadConversationHref('a&other=1'), '/admin/messaging?filter=all&thread=a%26other%3D1');
});
function statusRow() {
  const row = { leadId: 'lead-a', phone: '07700900123', leadStatus: 'CONTACTED', convertedTeamId: null, confirmationStatus: 'PENDING', latestRelevantEmailSentAt: beforeReply, latestInboundAt: null };
  for (const stage of ['first', 'final']) for (const field of ['Status','CreatedAt','UpdatedAt','ScheduledFor','ProcessedAt','SentAt','FailedAt','CancelledAt','FailureReason']) row[stage + field] = null;
  return row;
}
function statusModule(guard = async () => {}) {
  const runtimeDb = { $queryRaw: (query) => query.sql.includes('JOIN "LeadTeamConfirmation"') ? Promise.resolve([statusRow()]) : db.$queryRaw(query) };
  return loadTs('src/app/api/admin/leads/team-confirmation-sms-status/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/prisma': { prisma: runtimeDb }, '@/lib/requireAdmin': { requireAdmin: guard },
    '@/lib/leads/communication-evidence': evidenceLib,
  });
}
test('actual status endpoint returns evidence date and view-reply link', async () => {
  await fixture(); const response = await statusModule().GET(); const payload = await response.json();
  assert.match(JSON.stringify(payload), /reply received/); assert.match(JSON.stringify(payload), /Incoming SMS/);
  assert.ok(payload.statuses['lead-a'].lines.some((line) => line.href === '/admin/leads/lead-a#lead-reply-evidence'));
  assert.match(response.headers.get('cache-control'), /private, no-store/);
});
test('actual status endpoint labels orphan timestamp for review instead of reply received', async () => {
  await thread(); const payload = await (await statusModule().GET()).json();
  assert.match(JSON.stringify(payload), /reply record needs checking/); assert.doesNotMatch(JSON.stringify(payload), /reply received/);
});
test('status endpoint requires admin before querying history', async () => {
  await assert.rejects(statusModule(async () => { throw new Error('admin required'); }).GET(), /admin required/);
});
test('actual reminder job retains orphan and real-reply holds without sending', async () => {
  await thread();
  const runtimeDb = { $queryRaw: async () => [{ ...statusRow(), contactName: 'Alex Example', teamName: 'Example FC', effectiveLeagueId: 'league-a', leagueName: 'Example league', leagueSeason: null, firstSmsCreatedAt: null, firstSmsSentAt: null, finalSmsCreatedAt: null }] };
  const unexpectedSend = () => { throw new Error('The test must not reach any message queue or write'); };
  const job = loadTs('src/lib/leads/team-confirmation-sms-reminders.ts', {
    '@/lib/prisma': { prisma: runtimeDb }, '@/lib/leads/communication-evidence': evidenceLib,
    '@/lib/communications/log-dispatch': { logNotificationDispatchToThread: unexpectedSend },
    '@/lib/leads/teamPlaceConfirmation': { getTeamPlaceConfirmationUrl: unexpectedSend },
    '@/lib/notifications/recipients': { upsertNotificationRecipient: unexpectedSend },
    '@/lib/notifications/service': { queueNotificationFromTemplate: unexpectedSend },
  });
  for (const hasMessage of [false, true]) {
    if (hasMessage) await message(); const result = await job.runTeamLeadConfirmationSmsReminderJob();
    assert.equal(result.skippedReplied, 1); assert.equal(result.firstSmsQueued, 0); assert.equal(result.finalSmsQueued, 0); assert.deepEqual(result.errors, []);
  }
});
test('prepared lead layout requests the shared thread IDs and shows reply before email history', async () => {
  await fixture(); let requested;
  const layout = loadTs('src/app/(admin)/admin/leads/[id]/layout.tsx', {
    'next/link': { default: Anchor, __esModule: true },
    '@/components/admin/email/EmailHtmlPreview': { default: Preview, __esModule: true },
    '@/components/admin/communications/CommunicationStatusBadge': { default: () => null, CommunicationStatusExplanation: () => null, __esModule: true },
    '@/components/admin/messages/CancelQueuedSmsButton': { default: () => null, __esModule: true },
    '@/components/admin/leads/LeadReplyEvidence': { default: ReplyPanel, __esModule: true },
    '@/lib/leads/communication-evidence': evidenceLib,
    '@/lib/requireAdmin': { requireAdmin: async () => {} },
    '@/lib/prisma': { prisma: {
      interestLead: { findUnique: async () => ({ id: 'lead-a', email: null, emails: [] }) },
      notificationDispatch: { findMany: async () => [] },
      messageThread: { findMany: async (args) => { requested = args.where; return []; } },
    } },
  }).default;
  const html = renderToStaticMarkup(await layout({ params: Promise.resolve({ id: 'lead-a' }), children: React.createElement('p', null, 'Lead details') }));
  assert.deepEqual(requested, { id: { in: ['legacy'] } });
  assert.ok(html.indexOf('Latest incoming reply') < html.indexOf('Combined email audit trail'));
  assert.match(html, /Where do we play/); assert.match(html, /Lead details/); assert.match(html, /Lead communication timeline/);
});
test('all three consumers share the resolver, with no duplicate cached-only query', () => {
  for (const file of ['src/app/(admin)/admin/leads/[id]/layout.tsx', 'src/app/api/admin/leads/team-confirmation-sms-status/route.ts', 'src/lib/leads/team-confirmation-sms-reminders.ts']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /loadLeadCommunicationEvidence/);
    assert.doesNotMatch(source, /SELECT MAX\(thread\."latestInboundAt"\)/);
  }
});
