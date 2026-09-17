const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Prisma, PrismaClient } = require('@prisma/client');
const servicePath = 'src/lib/notifications/player-payment-resend.ts';
const pagePath = 'src/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/page.tsx';
const actionPath = 'src/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/resend-actions.ts';
function load(file, mocks = {}) {
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', code)((id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    const base = id.startsWith('@/') ? path.join('src', id.slice(2)) : id.startsWith('.') ? path.join(path.dirname(file), id) : null;
    if (base) for (const ext of ['', '.ts', '.tsx']) if (fs.existsSync(base + ext)) return load(base + ext, mocks);
    return require(id);
  }, m, m.exports);
  return m.exports;
}
function harness() {
  const recipient = { id: 'recipient', email: 'player@example.invalid', isSuppressed: false, transactionalEmailOptIn: true, preferences: { emailEnabled: true } };
  const member = { id: 'member', userId: 'user', role: 'PLAYER', user: { id: 'user', name: 'Test Player', email: recipient.email },
    team: { id: 'team', name: 'Test Team', league: null } };
  const fee = { id: 'fee', teamId: 'team', teamMemberId: 'member', prospectId: null, status: 'OPEN', amountPence: 500,
    paymentUrl: 'https://example.invalid/pay/saved-token', paymentToken: 'saved-token',
    team: { name: 'Test Team', logoUrl: null, league: null },
    fixture: { id: 'fixture', publishedAt: new Date(), status: 'COMPLETED', homeTeam: { name: 'Team A' }, awayTeam: { name: 'Team B' } } };
  const original = { id: 'original', channel: 'EMAIL', status: 'SENT', sentAt: new Date(0), sourceType: 'PLAYER_MATCH_FEE_REQUEST', sourceId: fee.id,
    recipientId: recipient.id, template: { key: 'player-match-fee-request-email', channel: 'EMAIL', kind: 'TRANSACTIONAL', isActive: true, name: 'Payment request' },
    variables: { amount: '£5.00', paymentUrl: fee.paymentUrl, firstName: 'Test', fixtureLabel: 'Test match' },
    recipient, bodyText: 'Original body', bodyHtml: '<p>Original email</p>', subject: 'Payment request', createdAt: new Date(0), scheduledFor: new Date(0) };
  const message = { id: 'message', notificationDispatchId: original.id, toEmail: recipient.email, sentAt: new Date(0), createdAt: new Date(0),
    channel: 'EMAIL', direction: 'OUTBOUND', participantRole: 'SYSTEM', providerStatus: 'SENT', dispatch: original, subject: 'Payment request', body: 'Original body', htmlBody: '<p>Original email</p>' };
  const state = { hold: null, ledger: { balancePence: 500, version: 1, userId: 'user', deletedAt: null }, owners: [{ userId: 'user' }], authorised: true };
  const queued = [], queries = [];
  let tail = Promise.resolve();
  const db = {
    teamMember: { findFirst: async (q) => q.where.id === member.id && q.where.teamId === 'team' ? member : null },
    playerMatchFee: { findUnique: async () => fee, findMany: async (q) => { queries.push(q); return [fee]; } },
    notificationRecipient: { findUnique: async () => recipient },
    notificationDispatch: { findUnique: async () => original, findFirst: async (q) => { queries.push(q); return queued[0] || null; }, findMany: async () => [original, ...queued] },
    messageEntry: { findFirst: async () => message },
    messageThread: { findMany: async () => [{ id: 'thread', messages: [message] }] },
    interestLeadEmail: { findMany: async () => [] }, emailTemplate: { findMany: async () => [] }, notificationTemplate: { findMany: async () => [] },
    $queryRaw: async (q) => { queries.push(q); return q.strings.join('').includes('TeamMemberProfile') ? state.owners : []; },
    $transaction: async (fn) => {
      const prior = tail; let release; tail = new Promise(r => { release = r; }); await prior;
      const before = queued.length;
      try { return await fn(db); } catch (e) { queued.length = before; throw e; } finally { release(); }
    },
  };
  const mocks = {
    '@/lib/prisma': { prisma: db },
    '@/lib/payments/player-ledger': { money: value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value / 100),
      playerFeeCollectionHold: async () => state.hold, readPlayerLedgerState: async () => state.ledger },
    './service': { queueNotificationFromTemplate: async (input, transaction) => {
      assert.equal(transaction, db, 'queue persistence must use the locked transaction');
      if (!original.template.isActive) throw new Error('Template disabled');
      // The real template service derives channel from NotificationTemplate.
      // Its output is a dispatch, not just a copy of the enqueue arguments.
      const next = { ...input, channel: original.template.channel, id: 'new-' + (queued.length + 1), status: 'QUEUED', recipient, template: original.template,
        createdAt: new Date(), scheduledFor: new Date(), sentAt: null, bodyText: 'Rendered from template' };
      queued.push(next); return next;
    } },
  };
  const service = load(servicePath, mocks);
  const input = { teamId: 'team', membershipId: 'member', referenceType: 'message', referenceId: 'message', expectedEmail: recipient.email, actorUserId: 'admin' };
  return { recipient, member, fee, original, message, state, db, queued, queries, mocks, service, input };
}

test('a sent automated payment email queues separately using the saved fee and editable template', async () => {
  const h = harness(), before = structuredClone(h.fee), original = structuredClone(h.original);
  const result = await h.service.queuePlayerPaymentEmailResend(h.input);
  assert.equal(result.reused, false); assert.equal(result.status, 'QUEUED');
  assert.equal(h.queued.length, 1); const q = h.queued[0];
  assert.equal(q.sourceType, h.original.sourceType); assert.equal(q.sourceId, 'fee');
  assert.equal(q.channel, 'EMAIL');
  assert.equal(q.templateKey, 'player-match-fee-request-email'); assert.equal(q.createdByUserId, 'admin');
  assert.equal(q.variables.paymentUrl, h.fee.paymentUrl); assert.equal(q.metadata.originalDispatchId, 'original');
  assert.equal(q.metadata.playerPaymentTimelineResend, true); assert.equal(q.paymentSummary.amount, '£5.00');
  assert.deepEqual(h.fee, before); assert.deepEqual(h.original, original);
  assert.ok(h.queries.some(q => q.strings?.join('').includes('pg_advisory_xact_lock')));
});

test('sent dispatch-only history is supported and double submissions reuse one queue receipt', async () => {
  const h = harness();
  const results = await Promise.all([h.input, { ...h.input, actorUserId: 'other-admin', referenceType: 'dispatch', referenceId: 'original' }].map(x => h.service.queuePlayerPaymentEmailResend(x)));
  assert.equal(h.queued.length, 1); assert.equal(results[0].dispatchId, results[1].dispatchId);
  assert.equal(results.filter(x => x.reused).length, 1);
});

test('paid, waived, cancelled, zero, held, repaid, unpublished and stale demands are blocked', async () => {
  const changes = [
    h => { h.fee.status = 'PAID'; }, h => { h.fee.status = 'WAIVED'; }, h => { h.fee.status = 'CANCELLED'; },
    h => { h.fee.amountPence = 0; }, h => { h.state.hold = 'An agreed repayment plan exists.'; },
    h => { h.state.ledger.balancePence = 0; }, h => { h.state.ledger.balancePence = 300; },
    h => { h.fee.fixture.publishedAt = null; }, h => { h.fee.fixture.status = 'CANCELLED'; },
    h => { h.fee.paymentUrl = 'https://example.invalid/changed'; }, h => { h.fee.paymentToken = null; },
    h => { h.state.ledger.deletedAt = new Date(); }, h => { h.original.status = 'QUEUED'; },
    h => { h.original.template.kind = 'MARKETING'; }, h => { h.original.sourceType = 'LOGIN'; },
    h => { h.original.template.channel = 'SMS'; }, h => { h.original.template.isActive = false; },
  ];
  for (const change of changes) {
    const h = harness(); change(h); await assert.rejects(h.service.queuePlayerPaymentEmailResend(h.input)); assert.equal(h.queued.length, 0);
  }
});

test('wrong player/team, changed email, suppression and ambiguous prospect identity cannot resend', async () => {
  for (const change of [
    h => { h.fee.teamId = 'other-team'; }, h => { h.fee.teamMemberId = 'other-member'; },
    h => { h.member.user.email = 'other@example.invalid'; }, h => { h.recipient.email = 'changed@example.invalid'; },
    h => { h.recipient.isSuppressed = true; }, h => { h.recipient.transactionalEmailOptIn = false; },
    h => { h.recipient.preferences.emailEnabled = false; }, h => { h.message.toEmail = 'old@example.invalid'; },
    h => { h.state.ledger.userId = 'other-user'; },
    h => { h.fee.teamMemberId = null; h.fee.prospectId = 'p'; h.state.owners.push({ userId: 'other-user' }); },
  ]) {
    const h = harness(); change(h); await assert.rejects(h.service.queuePlayerPaymentEmailResend(h.input)); assert.equal(h.queued.length, 0);
  }
  const h = harness(); h.fee.teamMemberId = null; h.fee.prospectId = 'p';
  await h.service.queuePlayerPaymentEmailResend(h.input); assert.equal(h.queued.length, 1);
});

test('the provider guard blocks payment or recipient changes after queueing, without affecting old dispatches', async () => {
  for (const change of [h => { h.fee.status = 'PAID'; }, h => { h.state.hold = 'Collection paused'; },
    h => { h.state.ledger.version++; }, h => { h.recipient.isSuppressed = true; },
    h => { h.fee.paymentUrl = 'https://example.invalid/new-link'; }, h => { h.fee.amountPence = 600; },
    h => { h.member.user.email = 'changed@example.invalid'; }, h => { h.recipient.email = 'changed@example.invalid'; },
    h => { h.queued[0].channel = 'SMS'; }, h => { delete h.queued[0].metadata.teamMemberId; }]) {
    const h = harness(); await h.service.queuePlayerPaymentEmailResend(h.input);
    assert.equal(await h.service.getPlayerPaymentResendDeliveryBlock(h.queued[0]), null);
    change(h); assert.ok(await h.service.getPlayerPaymentResendDeliveryBlock(h.queued[0]));
    assert.equal(await h.service.getPlayerPaymentResendDeliveryBlock({ metadata: {} }), null);
  }
});

test('the native page has a resend above the preview and includes queued direct-member fees once', async () => {
  const h = harness(); await h.service.queuePlayerPaymentEmailResend(h.input);
  const Control = load('src/components/admin/communications/PlayerPaymentEmailResend.tsx', {
    [actionPath.replace(/^src\//, '@/').replace(/\.ts$/, '')]: {},
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/resend-actions': { resendPlayerPaymentEmailAction: async () => ({ ok: true, message: 'Queued' }) },
  }).default;
  const Page = load(pagePath, { ...h.mocks,
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    'next/navigation': { notFound: () => { throw Error('Not found'); } },
    '@/lib/requireAdmin': { requireAdmin: async () => ({ user: { id: 'admin' } }) },
    '@/lib/teamMemberProfiles': { getTeamMemberProfilesByTeamMemberIds: async () => new Map() },
    '@/lib/datetime/london': { formatDateTimeInLondon: () => 'Test date' },
    '@/components/admin/communications/PlayerPaymentEmailResend': Control,
    '@/components/admin/email/EmailHtmlPreview': () => React.createElement('div', { 'data-preview': true }, 'Saved preview'),
    '@/components/admin/communications/TeamCommunicationsComposer': () => React.createElement('div', {}, 'Compose message'),
    '@/components/admin/people/LinkedRoleLinks': () => null,
    '@/app/(admin)/admin/messages/actions': { cancelQueuedSmsMessageAction: async () => {} },
  }).default;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: 'team', membershipId: 'member' }), searchParams: Promise.resolve({}) }));
  assert.match(html, /Resend payment email/); assert.match(html, /name="referenceId" value="message"/);
  // React may reorder attributes; verify the actual checkbox, not serialization order.
  const confirmation = html.match(/<input\b[^>]*\bname="confirmed"[^>]*>/)?.[0];
  assert.ok(confirmation); assert.match(confirmation, /type="checkbox"/); assert.match(confirmation, /\brequired(?:="")?(?:\s|\/?>)/);
  assert.match(html, /QUEUED|Queued/);
  assert.equal((html.match(/Resend payment email/g) || []).length, 1);
  assert.ok(html.indexOf('Resend payment email') < html.indexOf('Saved preview'));
  assert.ok(h.queries.some(q => q.where?.teamId === 'team' && q.where?.OR?.some(x => x.teamMemberId === 'member')));
});

test('the action requires admin confirmation, returns inline feedback, and never accepts replacement content', async () => {
  let calls = 0;
  const h = harness();
  const Action = load(actionPath, {
    '@/lib/requireAdmin': { requireAdmin: async () => { if (!h.state.authorised) throw Error('Not authorised'); return { user: { id: 'admin' } }; } },
    '@/lib/notifications/player-payment-resend': { ...h.service, queuePlayerPaymentEmailResend: async input => { calls++; assert.equal(input.actorUserId, 'admin'); return { dispatchId: 'new', reused: false }; } },
    'next/cache': { revalidatePath() {} },
  }).resendPlayerPaymentEmailAction;
  const form = new FormData();
  for (const [k,v] of Object.entries(h.input)) form.set(k,v);
  assert.equal((await Action({}, form)).ok, false); assert.equal(calls, 0);
  form.set('confirmed', 'on'); h.state.authorised = false; await assert.rejects(Action({}, form), /Not authorised/); assert.equal(calls, 0);
  h.state.authorised = true; assert.equal((await Action({}, form)).ok, true); assert.equal(calls, 1);
  assert.doesNotMatch(fs.readFileSync(actionPath,'utf8'), /form\.get\("(?:amount|subject|body|paymentUrl)"\)/);
});

test('new gate is on the actual provider path and normal email/SMS guards remain present', () => {
  const src = fs.readFileSync('src/lib/notifications/processor.ts','utf8');
  assert.ok(src.indexOf('getPlayerPaymentResendDeliveryBlock(dispatch)') < src.indexOf('await sendEmailWithResend('));
  for (const guard of ['playerLedgerNotificationBlock', 'applyPlayerPaymentWarningDeliveryGate', 'getFixtureConfirmationDeliveryBlock', 'getPlayerPoolProfileSmsDeliveryBlock']) assert.ok(src.includes(guard));
  const service = fs.readFileSync(servicePath,'utf8');
  assert.doesNotMatch(service, /playerMatchFee\.(create|update|delete)|paymentCharge\.(create|update|delete)|sendEmailWithResend|queueDirectNotification/);
});

test('real PostgreSQL transaction locks prevent duplicate sends across independent requests', { skip: !process.env.TEST_RESEND_DATABASE_URL }, async () => {
  const url = new URL(process.env.TEST_RESEND_DATABASE_URL);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname === '/sixfl_resend_test');
  const pg = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const h = harness();
  await pg.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "ResendContractQueue" (id text PRIMARY KEY, payload jsonb NOT NULL)');
  await pg.$executeRawUnsafe('TRUNCATE "ResendContractQueue"');
  h.db.$transaction = fn => pg.$transaction(tx => fn({ ...h.db,
    $queryRaw: q => tx.$queryRaw(q),
    notificationDispatch: { ...h.db.notificationDispatch, findFirst: async () => (await tx.$queryRawUnsafe('SELECT id, \'QUEUED\' AS status FROM "ResendContractQueue" LIMIT 1'))[0] || null },
    persist: async input => {
      await tx.$executeRaw(Prisma.sql`INSERT INTO "ResendContractQueue" (id,payload) VALUES ('new',${JSON.stringify(input)}::jsonb)`);
      return { id: 'new', status: 'QUEUED' };
    },
  }));
  const service = load(servicePath, { ...h.mocks, './service': { queueNotificationFromTemplate: (input, tx) => tx.persist(input) } });
  try {
    const replies = await Promise.all(Array.from({length:4}, (_, i) => service.queuePlayerPaymentEmailResend({ ...h.input, actorUserId: 'admin-' + i })));
    assert.equal(replies.filter(x => !x.reused).length, 1);
    assert.equal((await pg.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "ResendContractQueue"'))[0].n, 1);
  } finally { await pg.$disconnect(); }
});
