const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Execute the real page, shared reply router, timeline and email action with
// isolated I/O. No production database, provider or customer is contacted.
const pagePath = 'src/app/(admin)/admin/messages/referees/[id]/page.tsx';
const routerPath = 'src/components/admin/messages/AdminMessageThreadReplyRouter.tsx';
const threadPath = 'src/components/admin/messages/AdminMessageThread.tsx';
const actionPath = 'src/app/(admin)/admin/messages/email-reply-actions.ts';
const compiled = new Map();
function load(file, mocks) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText);
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled.get(file))(key => {
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (key === 'react' || key === 'react/jsx-runtime') return require(key);
    throw new Error(`Unmocked dependency in ${file}: ${key}`);
  }, mod, mod.exports);
  return mod.exports;
}
const date = new Date('2026-09-15T12:00:00Z');
const actor = { id: 'test-admin', name: 'Test Admin', email: 'admin@example.invalid', role: 'ADMIN' };
const referee = { id: 'test-referee', name: 'Test Referee', email: 'referee@example.invalid', role: 'REFEREE', createdFromLeadId: null };
function makeThread(overrides = {}) {
  return {
    id: 'test-referee-thread', sourceType: 'REFEREE', sourceId: referee.id,
    channel: 'EMAIL', status: 'OPEN', contactName: referee.name,
    contactEmail: referee.email, emailNormalized: referee.email,
    contactPhone: '07700900123', phoneNormalized: '+447700900123',
    replyAddress: 'thread-test@replies.example.invalid', unreadForAdminCount: 0,
    latestMessageAt: date, latestInboundAt: null, latestOutboundAt: date, updatedAt: date,
    teamId: null, leagueId: null, team: null, league: null,
    recipient: { id: 'test-recipient', displayName: referee.name, email: referee.email, phone: '+447700900123', audience: 'REFEREE', sourceType: 'REFEREE' },
    messages: [{
      id: 'test-message', channel: 'SMS', direction: 'OUTBOUND', participantRole: 'ADMIN',
      body: 'Test SMS in the same conversation', textBody: 'Test SMS in the same conversation',
      htmlBody: null, subject: null, fromNumber: null, toNumber: '+447700900123',
      fromEmail: null, toEmail: null, providerStatus: 'queued', sentAt: null,
      receivedAt: null, readAt: null, createdAt: date, createdByUser: actor,
      dispatch: { id: 'test-dispatch', status: 'QUEUED', failureReason: null, scheduledFor: date,
        sentAt: null, template: null, metadata: { manualSmsReply: true } },
    }],
    ...overrides,
  };
}

async function renderPage(options = {}) {
  const thread = makeThread(options.thread);
  const threads = options.empty ? [] : [thread];
  let authorised = false;
  let threadQuery;
  let passedThread;
  let smsProps;
  let resendProps;
  let targetCalls = 0;
  let sendCalls = 0;
  const unavailableAction = async () => { sendCalls++; throw new Error('Rendering must not send a message'); };
  const mocks = {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    'next/navigation': {
      useSearchParams: () => new URLSearchParams(),
      notFound: () => { throw new Error('Not found'); },
    },
    'react-dom': { useFormStatus: () => ({ pending: false }) },
    '@prisma/client': { NotificationRecipientSourceType: { REFEREE: 'REFEREE' }, UserRole: { REFEREE: 'REFEREE' } },
    '@/lib/requireAdmin': { requireAdmin: async () => {
      if (options.denyAdmin) throw new Error('Admin required');
      authorised = true;
      return { user: actor };
    } },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => { assert.ok(authorised); return options.missingReferee ? null : referee; } },
      $queryRaw: async () => { assert.ok(authorised); return [{ phone: '+447700900123' }]; },
      messageThread: { findMany: async query => { assert.ok(authorised); threadQuery = query; return threads; } },
    } },
    '@/lib/messaging/admin-sms-reply': { getAdminSmsReplyTarget: async selected => {
      assert.ok(authorised);
      assert.equal(selected.id, thread.id);
      targetCalls++;
      return { phone: options.noSmsTarget ? null : '+447700900123' };
    } },
    '@/components/admin/people/LinkedRoleLinks': () => null,
    '@/components/admin/email/EmailHtmlPreview': () => React.createElement('div', null, 'Email preview'),
    '@/components/admin/messages/AdminEmailResendPanel': props => { resendProps = props; return React.createElement('div', null, 'Existing email resend controls'); },
    '@/components/admin/messages/AdminSmsReplyForm': props => {
      smsProps = props;
      return React.createElement('button', { disabled: !props.canReply || !props.actorId }, 'Send SMS reply');
    },
    '@/app/(admin)/admin/messages/actions': {
      archiveMessageThreadAction: unavailableAction, markMessageThreadReadAction: unavailableAction, reopenMessageThreadAction: unavailableAction,
    },
    '@/app/(admin)/admin/messages/email-reply-actions': { sendAdminEmailReplyAction: unavailableAction },
    '@/lib/messaging/sms-reply-display': load('src/lib/messaging/sms-reply-display.ts', {}),
  };
  const Thread = load(threadPath, mocks).default;
  mocks['@/components/admin/messages/AdminMessageThread'] = props => {
    passedThread = props.thread;
    return React.createElement(Thread, props);
  };
  mocks['@/components/admin/messages/AdminMessageThreadReplyRouter'] = load(routerPath, mocks).default;
  const Page = load(pagePath, mocks).default;
  const html = renderToStaticMarkup(await Page({
    params: Promise.resolve({ id: referee.id }), searchParams: Promise.resolve(options.searchParams ?? {}),
  }));
  assert.equal(sendCalls, 0, 'Opening the page never sends or resends');
  return { html, threadQuery, passedThread, smsProps, resendProps, targetCalls };
}
function emailForm(html) {
  const form = (html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) ?? []).find(value => value.includes('Send email reply'));
  assert.ok(form, 'The shared email reply form must be present');
  return form;
}

for (const channel of ['EMAIL', 'SMS']) {
  test(`${channel} mixed referee conversation has email and SMS controls with the same thread identity`, async () => {
    const { html, smsProps, passedThread, resendProps } = await renderPage({ thread: { channel } });
    const form = emailForm(html);
    assert.match(html, /Reply by email/);
    assert.match(form, /Replying to referee@example.invalid/);
    assert.match(form, /name="threadId" value="test-referee-thread"/);
    // Check the boolean HTML attribute, not a Tailwind disabled: class.
    assert.doesNotMatch(form, /<(?:textarea|button)\b[^>]*\sdisabled=""/);
    assert.deepEqual(smsProps, { threadId: 'test-referee-thread', actorId: actor.id, phone: '+447700900123', canReply: true });
    assert.equal(resendProps.threadId, passedThread.id);
    assert.ok(html.indexOf('Reply by email') < html.indexOf('Reply by SMS'));
  });
}

test('real delivery status and sender attribution survive the referee page serialization', async () => {
  const { threadQuery, passedThread } = await renderPage();
  const message = passedThread.messages[0];
  assert.equal(message.dispatch.status, 'QUEUED');
  assert.equal(message.dispatch.sentAt, null);
  assert.equal(message.dispatch.scheduledFor, date.toISOString());
  assert.deepEqual(message.createdByUser, actor);
  for (const key of ['status', 'failureReason', 'scheduledFor', 'sentAt']) assert.equal(threadQuery.include.messages.include.dispatch.select[key], true);
  assert.equal(threadQuery.include.messages.include.createdByUser.select.id, true);
  assert.deepEqual(threadQuery.where.OR, [
    { sourceType: 'REFEREE', sourceId: referee.id },
    { recipient: { sourceType: 'REFEREE', sourceId: referee.id } },
  ]);
});

for (const status of ['ARCHIVED', 'CLOSED']) {
  test(`${status} conversations cannot submit either reply`, async () => {
    const { html, smsProps } = await renderPage({ thread: { status } });
    assert.match(emailForm(html), /<textarea\b[^>]*\sdisabled=""/);
    assert.match(emailForm(html), /<button\b[^>]*\sdisabled=""/);
    assert.equal(smsProps.canReply, false);
  });
}

test('missing email disables email replies and never uses the inbound reply-address as a recipient', async () => {
  const { html, smsProps } = await renderPage({ thread: { contactEmail: null, emailNormalized: null, recipient: null } });
  assert.match(emailForm(html), /<textarea\b[^>]*\sdisabled=""/);
  assert.doesNotMatch(emailForm(html), /Replying to thread-test@/);
  assert.equal(smsProps.canReply, true);
});

test('recipient email fallback works in an SMS-labelled conversation', async () => {
  const { html } = await renderPage({ thread: { channel: 'SMS', contactEmail: null, emailNormalized: null } });
  assert.match(emailForm(html), /Replying to referee@example.invalid/);
});

test('unavailable server SMS target is not replaced with the raw contact number; email remains available', async () => {
  const { html, smsProps } = await renderPage({ noSmsTarget: true });
  assert.equal(smsProps.phone, null);
  assert.equal(smsProps.canReply, false);
  assert.doesNotMatch(emailForm(html), /<textarea\b[^>]*\sdisabled=""/);
});

test('a supplied unrelated thread ID cannot escape the referee-scoped query', async () => {
  const { passedThread } = await renderPage({ searchParams: { thread: 'someone-elses-thread' } });
  assert.equal(passedThread.id, 'test-referee-thread');
});

test('no conversation shows an empty state without creating, sending or resolving a target', async () => {
  const { html, targetCalls } = await renderPage({ empty: true });
  assert.match(html, /No thread yet/);
  assert.doesNotMatch(html, /Send email reply|Send SMS reply/);
  assert.equal(targetCalls, 0);
});

test('administrator and referee identity checks run before conversation access', async () => {
  await assert.rejects(renderPage({ denyAdmin: true }), /Admin required/);
  await assert.rejects(renderPage({ missingReferee: true }), /Not found/);
});

// The same action used by the shared form sends and records the reply on the
// selected conversation; exercise it without calling any live provider.
async function submitEmail(options = {}) {
  const thread = makeThread(options.thread);
  const calls = { provider: [], entries: [], updates: [], revalidated: [] };
  let authorised = false;
  const mocks = {
    'next/cache': { revalidatePath: path => calls.revalidated.push(path) },
    'next/navigation': { redirect: url => { const error = new Error('Redirect'); error.url = url; throw error; } },
    '@/lib/requireAdmin': { requireAdmin: async () => {
      if (options.denyAdmin) throw new Error('Admin required');
      authorised = true; return { user: actor };
    } },
    '@/lib/email/reply-address': { buildThreadReplyAddress: id => `thread-${id}@replies.example.invalid` },
    '@/lib/messaging/service': { getMessageThreadById: async id => { assert.ok(authorised); assert.equal(id, thread.id); return thread; } },
    '@/lib/prisma': { prisma: {
      messageEntry: {
        findFirst: async () => options.duplicate ? { id: 'previous-reply' } : null,
        create: async ({ data }) => { calls.entries.push(data); return { id: 'saved-email', ...data }; },
      },
      messageThread: { update: async value => { calls.updates.push(value); return thread; } },
    } },
    '@/lib/notifications/providers/resend': { sendEmailWithResend: async input => {
      assert.ok(authorised); calls.provider.push(input);
      if (options.providerFailure) throw new Error('Isolated provider failure');
      return { provider: 'resend', providerMessageId: 'fake-provider-id', responsePayload: {}, fromEmail: 'sixfl@example.invalid' };
    } },
  };
  const form = new FormData();
  form.set('threadId', thread.id); form.set('filter', 'all');
  form.set('body', options.emptyBody ? '' : 'Hello referee');
  try {
    await load(actionPath, mocks).sendAdminEmailReplyAction(form);
    assert.fail('The existing action must finish with its normal redirect');
  } catch (error) {
    if (!error.url) throw error;
    calls.redirect = new URL(error.url, 'https://example.invalid');
  }
  return calls;
}

for (const channel of ['EMAIL', 'SMS']) {
  test(`${channel}: shared email action sends to the displayed contact and retains the conversation`, async () => {
    const calls = await submitEmail({ thread: { channel } });
    assert.equal(calls.provider.length, 1);
    assert.equal(calls.provider[0].to, referee.email);
    assert.equal(calls.provider[0].replyTo, 'thread-test@replies.example.invalid');
    assert.equal(calls.entries.length, 1);
    assert.equal(calls.entries[0].threadId, 'test-referee-thread');
    assert.equal(calls.entries[0].channel, 'EMAIL');
    assert.equal(calls.entries[0].createdByUserId, actor.id);
    assert.equal(calls.redirect.searchParams.get('thread'), 'test-referee-thread');
    assert.ok(calls.revalidated.includes('/admin/messaging'));
  });
}

for (const options of [{ emptyBody: true }, { thread: { status: 'ARCHIVED' } },
  { thread: { contactEmail: null, emailNormalized: null, recipient: null } }]) {
  test(`shared action blocks invalid replies: ${JSON.stringify(options)}`, async () => {
    const calls = await submitEmail(options);
    assert.equal(calls.provider.length, 0);
    assert.equal(calls.entries.length, 0);
    assert.equal(calls.updates.length, 0);
  });
}

test('provider failure never creates a sent message or success notice', async () => {
  const calls = await submitEmail({ providerFailure: true });
  assert.equal(calls.entries.length, 0);
  assert.match(calls.redirect.search, /send_failed/);
});

test('shared email action authenticates before sending', async () => {
  await assert.rejects(submitEmail({ denyAdmin: true }), /Admin required/);
});

if (process.env.SIXFL_PREPARED_SOURCE === '1') {
  test('prepared email duplicate safeguard remains active for referee replies', async () => {
    const calls = await submitEmail({ duplicate: true });
    assert.equal(calls.provider.length, 0);
    assert.equal(calls.entries.length, 0);
    assert.equal(calls.redirect.searchParams.get('emailReply'), 'duplicate');
  });
}

test('referee and main inbox use the same reply router rather than a referee-only sender', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  assert.match(page, /<AdminMessageThreadReplyRouter\b/);
  assert.doesNotMatch(page, /<AdminMessageThread\s|as never|sendEmailWithResend|queueDirectNotification/);
  assert.match(fs.readFileSync('src/components/admin/messages/AdminMessagesInbox.tsx', 'utf8'), /<AdminMessageThreadReplyRouter\b/);
  assert.match(fs.readFileSync(routerPath, 'utf8'), /action=\{sendAdminEmailReplyAction\}/);
});
