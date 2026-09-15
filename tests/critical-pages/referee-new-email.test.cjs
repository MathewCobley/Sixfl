const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = 'src/app/(admin)/admin/messages/referees/[id]';
const referee = { id: 'test-referee', name: 'Test Referee', email: 'referee@example.invalid', role: 'REFEREE', createdFromLeadId: null };
const enums = Object.fromEntries(['NotificationAudience', 'NotificationChannel', 'NotificationDispatchStatus', 'NotificationRecipientSourceType', 'UserRole'].map(key => [key, { REFEREE: 'REFEREE', EMAIL: 'EMAIL', SMS: 'SMS', QUEUED: 'QUEUED' }]));
const cache = new Map();
function load(path, mocks) {
  if (!cache.has(path)) cache.set(path, ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText);
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', cache.get(path))(key => {
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (key === 'react' || key === 'react/jsx-runtime') return require(key);
    throw new Error(`Unexpected dependency: ${path}: ${key}`);
  }, mod, mod.exports);
  return mod.exports;
}

async function renderCompose(options = {}) {
  let authorised = false;
  let reads = 0;
  let formProps;
  const action = async () => { throw new Error('Rendering must never send'); };
  const Form = load(`${root}/new/NewEmailForm.tsx`, {
    'react-dom': { useFormStatus: () => ({ pending: Boolean(options.pending) }) },
  }).default;
  const Page = load(`${root}/new/page.tsx`, {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    'next/navigation': { notFound: () => { throw new Error('Not found'); } },
    '@prisma/client': enums,
    '@/lib/requireAdmin': { requireAdmin: async () => {
      if (options.denied) throw new Error('Admin required');
      authorised = true;
    } },
    // Deliberately no threads, welcome dispatches, writes or providers here.
    '@/lib/prisma': { prisma: { user: { findUnique: async query => {
      assert.ok(authorised); reads++;
      assert.equal(query.where.id, referee.id);
      return options.missing ? null : { ...referee, ...options.referee };
    } } } },
    '../actions': { sendCentralRefereeEmailAction: action },
    './NewEmailForm': props => { formProps = props; return React.createElement(Form, props); },
  }).default;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: referee.id }) }));
  return { html, reads, formProps, action };
}

test('new email opens blank subject/body with the saved recipient and existing central action', async () => {
  const { html, reads, formProps, action } = await renderCompose();
  assert.equal(reads, 1);
  assert.equal(formProps.action, action);
  assert.equal(formProps.refereeId, referee.id);
  assert.match(html, /New email/);
  assert.match(html, /referee@example.invalid/);
  assert.match(html, /name="subject"/);
  assert.match(html, /name="body"/);
  assert.match(html, /Send new email/);
  assert.match(html, /You do not need an existing conversation or a welcome email/);
  assert.doesNotMatch(html, /name="threadId"|name="toEmail"|name="templateId"|Send email reply|Resend email/);
  const subject = html.match(/<input\b[^>]*name="subject"[^>]*>/)[0];
  assert.doesNotMatch(subject, /\svalue=/);
  assert.match(html, /<textarea\b[^>]*name="body"[^>]*><\/textarea>/);
  assert.match(html, /href="\/admin\/messages\/referees\/test-referee"/);
});

for (const email of [null, '', 'not-an-email']) {
  test(`missing/invalid saved email ${JSON.stringify(email)} disables new sends`, async () => {
    const { html } = await renderCompose({ referee: { email } });
    assert.match(html, /Add a valid email address/);
    // React can emit name after disabled; attribute order is not behaviour.
    const subject = html.match(/<input\b[^>]*name="subject"[^>]*>/)?.[0];
    assert.ok(subject, 'Subject field is present');
    assert.match(subject, /\sdisabled=""/);
    assert.match(html, /<button\b[^>]*\sdisabled=""/);
  });
}

test('pending submit is disabled and says queueing, never delivered', async () => {
  const { html } = await renderCompose({ pending: true });
  assert.match(html, /Queueing email…/);
  assert.match(html, /<button\b[^>]*\sdisabled=""/);
  assert.doesNotMatch(html, /delivered successfully/i);
});

test('compose rejects unauthorised, missing and non-referee identities', async () => {
  await assert.rejects(renderCompose({ denied: true }), /Admin required/);
  await assert.rejects(renderCompose({ missing: true }), /Not found/);
  await assert.rejects(renderCompose({ referee: { role: 'USER' } }), /Not found/);
});

// Run the existing central action with isolated queue/thread I/O. There is no
// provider mock because the action must never contact one directly.
async function submit(options = {}) {
  let authorised = false;
  const calls = { queue: [], link: [], sync: [], reads: [], revalidate: [] };
  const redirect = url => { const error = new Error('Redirect'); error.url = url; throw error; };
  const action = load(`${root}/actions.ts`, {
    '@prisma/client': enums,
    'next/cache': { revalidatePath: path => calls.revalidate.push(path) },
    'next/navigation': { redirect },
    '@/lib/requireAdmin': { requireAdmin: async () => {
      if (options.denied) throw new Error('Admin required');
      authorised = true;
      return { user: options.noActor ? null : { id: 'test-admin' } };
    } },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async query => {
        assert.ok(authorised); calls.reads.push(query);
        assert.equal(query.where.id, referee.id);
        return options.missing ? null : { ...referee, ...options.referee };
      } },
      $queryRaw: async () => [{ phone: '+447700900123', standardNightFeePence: 4500 }],
      notificationRecipient: { findFirst: async query => {
        assert.ok(authorised);
        assert.deepEqual(query.where, { sourceType: 'REFEREE', sourceId: referee.id });
        return options.preferences ?? null;
      } },
    } },
    '@/lib/notifications/phone': { normalizePhoneNumber: value => value },
    '@/lib/notifications/recipients': { upsertNotificationRecipient: async input => {
      assert.ok(authorised); calls.sync.push(input); return { id: 'test-recipient' };
    } },
    '@/lib/notifications/service': { queueDirectNotification: async input => {
      assert.ok(authorised); calls.queue.push(input);
      return { id: 'test-dispatch', status: options.status ?? 'QUEUED', subject: input.subject,
        bodyText: input.body, bodyHtml: '<p>Isolated body</p>' };
    } },
    '@/lib/messaging/service': {
      linkQueuedEmailDispatchToThread: async input => {
        assert.ok(authorised); calls.link.push(input); return { id: 'test-history-thread' };
      },
      recordOutboundSms: async () => { throw new Error('New email must never send SMS instead'); },
    },
  }).sendCentralRefereeEmailAction;
  const form = new FormData();
  for (const [key, value] of Object.entries({ refereeId: referee.id, subject: '  Next month’s availability  ', body: '  A completely new message.  ', ...options.form })) form.set(key, value);
  try { await action(form); assert.fail('Expected normal action redirect'); }
  catch (error) { if (!error.url) throw error; calls.redirect = new URL(error.url, 'https://example.invalid'); }
  return calls;
}

test('fresh subject is queued exactly once and logged without requiring an existing message', async () => {
  const calls = await submit({ form: { toEmail: 'wrong@example.invalid', threadId: 'wrong-thread', templateId: 'welcome' } });
  assert.equal(calls.queue.length, 1);
  const queued = calls.queue[0];
  assert.equal(queued.subject, 'Next month’s availability');
  assert.equal(queued.body, 'A completely new message.');
  assert.equal(queued.sourceType, 'REFEREE');
  assert.equal(queued.sourceId, referee.id);
  assert.equal(queued.createdByUserId, 'test-admin');
  assert.equal(queued.channel, 'EMAIL');
  assert.equal(calls.link.length, 1);
  assert.equal(calls.link[0].toEmail, referee.email);
  assert.equal(calls.link[0].notificationDispatchId, 'test-dispatch');
  assert.equal(calls.link[0].subject, queued.subject);
  assert.equal(calls.redirect.pathname, `/admin/messages/referees/${referee.id}`);
  assert.equal(calls.redirect.searchParams.get('saved'), 'email');
  assert.equal(calls.redirect.searchParams.get('thread'), 'test-history-thread');
  for (const path of ['/admin/messaging', '/admin/messages', `/admin/messages/referees/${referee.id}`, `/admin/referees/${referee.id}`]) assert.ok(calls.revalidate.includes(path));
});

for (const form of [{ subject: '' }, { body: '   ' }, { subject: 'x'.repeat(201) }, { subject: 'Subject\r\nBcc: other@example.invalid' }, { body: 'x'.repeat(20001) }, { refereeId: '' }]) {
  test(`invalid new message is rejected: ${Object.keys(form).join(',')} (${Object.values(form)[0].length} characters)`, async () => {
    const calls = await submit({ form });
    assert.equal(calls.queue.length, 0);
    assert.equal(calls.link.length, 0);
  });
}

for (const options of [{ missing: true }, { referee: { role: 'USER' } }, { referee: { email: null } }, { referee: { email: 'invalid' } }, { noActor: true }]) {
  test(`new email rejects invalid identity: ${JSON.stringify(options)}`, async () => {
    const calls = await submit(options);
    assert.equal(calls.queue.length, 0);
    assert.equal(calls.link.length, 0);
    if (options.noActor) assert.equal(calls.reads.length, 0);
  });
}

test('new email requires admin authorisation before any read or send', async () => {
  await assert.rejects(submit({ denied: true }), /Admin required/);
});

test('saved email/SMS opt-outs are preserved and a blocked dispatch is never reported queued', async () => {
  const preferences = { transactionalEmailOptIn: false, transactionalSmsOptIn: false, marketingEmailOptIn: true, marketingSmsOptIn: false };
  const calls = await submit({ preferences, status: 'SKIPPED' });
  for (const [key, value] of Object.entries(preferences)) assert.equal(calls.sync[0][key], value);
  assert.equal(calls.link.length, 0);
  assert.equal(calls.redirect.searchParams.get('saved'), null);
  assert.ok(calls.redirect.searchParams.get('error'));
  assert.ok(!Object.hasOwn(calls.sync[0], 'isSuppressed'));
});

for (const status of ['CANCELLED', 'FAILED']) {
  test(`${status} is not a successful new email`, async () => {
    const calls = await submit({ status });
    assert.equal(calls.link.length, 0);
    assert.equal(calls.redirect.searchParams.get('saved'), null);
  });
}

test('native referee history exposes New email independently of the thread and preserves shared replies', async () => {
  const unavailable = async () => { throw new Error('Page must not write or send'); };
  const Page = load(`${root}/page.tsx`, {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    'next/navigation': { notFound: unavailable },
    '@prisma/client': enums,
    '@/lib/requireAdmin': { requireAdmin: async () => ({ user: { id: 'test-admin' } }) },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => referee }, $queryRaw: async () => [],
      messageThread: { findMany: async () => [] },
    } },
    '@/lib/messaging/admin-sms-reply': { getAdminSmsReplyTarget: unavailable },
    '@/components/admin/people/LinkedRoleLinks': () => null,
    '@/components/admin/messages/AdminMessageThreadReplyRouter': ({ thread }) => {
      assert.equal(thread, null); return React.createElement('div', null, 'Shared reply controls');
    },
  }).default;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: referee.id }) }));
  assert.match(html, /href="\/admin\/messages\/referees\/test-referee\/new"/);
  assert.match(html, /New email/);
  assert.match(html, /No welcome email is required/);
  assert.match(html, /Shared reply controls/);
  assert.doesNotMatch(html, /Start with the referee welcome email|Send the welcome email from the referee profile/);
  assert.ok(html.indexOf('New email') < html.indexOf('Conversation timeline'));
});
