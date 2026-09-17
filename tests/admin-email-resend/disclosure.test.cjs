const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Execute the shared component, never a database, provider or real server action.
const panelPath = 'src/components/admin/messages/AdminEmailResendPanel.tsx';
const compiled = ts.transpileModule(fs.readFileSync(panelPath, 'utf8'), {
  fileName: panelPath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const message = {
  id: 'email-old', channel: 'EMAIL', direction: 'OUTBOUND', participantRole: 'ADMIN',
  subject: 'Older saved email', toEmail: 'recipient@example.invalid',
  sentAt: '2026-09-10T10:00:00Z', createdAt: '2026-09-10T09:59:00Z',
};
const messages = [message, {
  ...message, id: 'email-new', subject: 'Newest saved email',
  sentAt: '2026-09-15T10:00:00Z', createdAt: '2026-09-15T09:59:00Z',
}];

function render(options = {}) {
  let sendCalls = 0;
  const action = async () => { sendCalls++; throw new Error('Rendering must never send email'); };
  const mocks = {
    'next/navigation': { useSearchParams: () => new URLSearchParams(options.query || '') },
    'react-dom': { useFormStatus: () => ({ pending: Boolean(options.pending) }) },
    '@/app/(admin)/admin/messages/actions': { resendAdminEmailAction: action },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(key => {
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (key === 'react/jsx-runtime') return require(key);
    throw new Error(`Unexpected resend panel dependency: ${key}`);
  }, mod, mod.exports);
  const element = mod.exports.default({
    threadId: options.threadId || 'thread-one', selectedFilter: 'all',
    messages: options.messages || messages,
  });
  const html = renderToStaticMarkup(element);
  assert.equal(sendCalls, 0);
  return { element, html, action };
}

function nodes(element, predicate) {
  if (!React.isValidElement(element)) return [];
  const found = predicate(element) ? [element] : [];
  for (const child of React.Children.toArray(element.props.children)) found.push(...nodes(child, predicate));
  return found;
}
function outer(element) {
  const result = nodes(element, node => node.type === 'details' && node.props.className === 'group/resend');
  assert.equal(result.length, 1, 'One native disclosure owns the entire resend section');
  return result[0];
}

test('resend list, explanation and confirmation forms are behind one initially closed disclosure', () => {
  const { element, html } = render();
  const disclosure = outer(element);
  assert.ok(!disclosure.props.open, 'Never expand the outer tools on initial load');
  assert.equal(nodes(disclosure, node => node.type === 'summary').length, 3);
  const summary = React.Children.toArray(disclosure.props.children)[0];
  assert.equal(summary.type, 'summary');
  assert.match(renderToStaticMarkup(summary), /Resend an email/);
  assert.match(renderToStaticMarkup(summary), />2<\/span>/);
  assert.equal(summary.props.onClick, undefined, 'Disclosure cannot call a send action');
  assert.equal(nodes(disclosure, node => node.type === 'form').length, 2);
  assert.equal(nodes(element, node => node.type === 'form').length, 2, 'No resend forms outside the collapsed tools');
  assert.equal(nodes(disclosure, node => node.type === 'h3').length, 1);
  assert.match(renderToStaticMarkup(disclosure), /Resend the exact saved email/);
  assert.doesNotMatch(html.match(/<details\b[^>]*>/)[0], /\sopen(?:=|\s|>)/);
});

test('opening a new conversation resets the disclosure and confirmation subtree', () => {
  // Inspect the direct child keys before React.Children normalises key strings.
  const first = render({ threadId: 'thread-one' }).element.props.children.find(child => child?.type === 'details');
  const second = render({ threadId: 'thread-two' }).element.props.children.find(child => child?.type === 'details');
  assert.equal(first.key, 'thread-one');
  assert.equal(second.key, 'thread-two');
  assert.notEqual(first.key, second.key);
  assert.ok(!second.props.open);
});

test('same saved emails, newest-first order, exact identities, confirmation and server action are preserved', () => {
  const before = JSON.stringify(messages);
  const { element, action } = render();
  const forms = nodes(outer(element), node => node.type === 'form');
  assert.deepEqual(forms.map(form => nodes(form, node => node.type === 'input' && node.props.name === 'messageId')[0].props.value), ['email-new', 'email-old']);
  for (const form of forms) {
    assert.equal(form.props.action, action);
    const inputs = Object.fromEntries(nodes(form, node => node.type === 'input').map(node => [node.props.name, node.props]));
    assert.equal(inputs.threadId.value, 'thread-one');
    assert.equal(inputs.filter.value, 'all');
    assert.equal(inputs.confirmed.type, 'checkbox');
    assert.equal(inputs.confirmed.required, true);
    assert.ok(!inputs.confirmed.defaultChecked && !inputs.confirmed.checked);
  }
  assert.equal(JSON.stringify(messages), before, 'Do not mutate conversation history');
});

for (const invalid of [
  { channel: 'SMS' }, { direction: 'INBOUND' }, { participantRole: 'SYSTEM' },
  { participantRole: 'CONTACT' }, { sentAt: null }, { toEmail: null }, { toEmail: '   ' },
]) {
  test(`resend eligibility unchanged: ${JSON.stringify(invalid)}`, () => {
    assert.equal(render({ messages: [{ ...message, ...invalid }] }).html, '');
  });
}

test('no eligible messages means no empty resend button', () => {
  assert.equal(render({ messages: [] }).html, '');
});

for (const [query, text] of [
  ['resent=1', 'Email queued to resend.'],
  ['resend_existing=1', 'no duplicate send was created'],
  ['error=email_resend_confirmation', 'Confirm the resend'],
  ['error=email_resend_unavailable', 'cannot be resent'],
  ['error=email_resend_blocked', 'The email was not queued.'],
]) {
  test(`resend feedback is visible outside the closed tools: ${query}`, () => {
    const { element, html } = render({ query });
    const disclosure = outer(element);
    assert.ok(!disclosure.props.open);
    assert.equal(nodes(disclosure, node => node.props.role === 'status').length, 0);
    const statuses = nodes(element, node => node.props.role === 'status');
    assert.equal(statuses.length, 1);
    assert.ok(renderToStaticMarkup(statuses[0]).includes(text));
    assert.ok(html.indexOf('role="status"') < html.indexOf('<details'));
  });
}

test('pending resend remains disabled without expanding the panel', () => {
  const { html, element } = render({ pending: true });
  assert.match(html, /<button\b[^>]*\sdisabled=""/);
  assert.match(html, /Queuing/);
  assert.ok(!outer(element).props.open);
});

test('saved subject and recipient are still rendered as escaped text', () => {
  const { html } = render({ messages: [{ ...message, subject: '<img src=x onerror=bad()>', toEmail: '<x>@example.invalid' }] });
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;x&gt;@example.invalid/);
});

test('inventory shared resend entry points without creating a second implementation', () => {
  const consumers = [];
  function scan(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) scan(file);
      else if (/\.(tsx?|jsx?)$/.test(file) && fs.readFileSync(file, 'utf8').includes('<AdminEmailResendPanel')) consumers.push(file);
    }
  }
  scan('src');
  assert.ok(consumers.includes('src/components/admin/messages/AdminMessageThreadReplyRouter.tsx'));
  console.log('Shared resend consumers:', consumers.join(', '));
  const router = fs.readFileSync('src/components/admin/messages/AdminMessageThreadReplyRouter.tsx', 'utf8');
  assert.match(router, /messages=\{labelledThread\.messages\}/);
  assert.match(router, /sendAdminEmailReplyAction/);
  assert.match(router, /<AdminMessageThread\b/);
});
