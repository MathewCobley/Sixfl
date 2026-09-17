const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const file = 'src/components/admin/communications/PlayerPaymentEmailResend.tsx';
const actionPath = '@/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/resend-actions';
const props = { teamId: 'team', membershipId: 'member', referenceType: 'message', referenceId: 'message', recipientEmail: 'player@example.invalid' };
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function render(options = {}) {
  let sends = 0, refreshes = 0;
  const effects = [];
  const action = async () => { sends++; throw Error('Rendering must never send'); };
  const mocks = {
    react: { ...React, useActionState: handler => {
      assert.equal(handler, action);
      return [options.state || { ok: false, message: '' }, action, Boolean(options.pending)];
    }, useEffect: callback => effects.push(callback) },
    'next/navigation': { useRouter: () => ({ refresh() { refreshes++; } }) },
    [actionPath]: { resendPlayerPaymentEmailAction: action },
    'react/jsx-runtime': require('react/jsx-runtime'),
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`);
    return mocks[id];
  }, mod, mod.exports);
  const keyed = mod.exports.default({ ...props, ...options.props });
  const tree = keyed.type(keyed.props);
  const html = renderToStaticMarkup(tree);
  for (const effect of effects) effect();
  assert.equal(sends, 0);
  return { tree, html, action, key: keyed.key, refreshes };
}
function nodes(tree, type) {
  if (!React.isValidElement(tree)) return [];
  return [...(tree.type === type ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => nodes(child, type))];
}

test('individual resend form is entirely inside a single initially closed disclosure', () => {
  const { tree, html, action } = render();
  const disclosures = nodes(tree, 'details');
  assert.equal(disclosures.length, 1);
  assert.ok(!disclosures[0].props.open);
  const summary = nodes(disclosures[0], 'summary')[0];
  assert.match(renderToStaticMarkup(summary), /Resend options/);
  assert.equal(summary.props.onClick, undefined);
  const forms = nodes(disclosures[0], 'form');
  assert.equal(forms.length, 1); assert.equal(nodes(tree, 'form').length, 1);
  assert.equal(forms[0].props.action, action);
  const inputs = Object.fromEntries(nodes(forms[0], 'input').map(node => [node.props.name, node.props]));
  for (const field of ['teamId', 'membershipId', 'referenceType', 'referenceId']) assert.equal(inputs[field].value, props[field]);
  assert.equal(inputs.expectedEmail.value, props.recipientEmail);
  assert.equal(inputs.confirmed.required, true); assert.ok(!inputs.confirmed.defaultChecked);
  assert.doesNotMatch(html.match(/<details\b[^>]*>/)[0], /\sopen(?:=|\s|>)/);
});

for (const [field, value] of Object.entries({ teamId: 'other-team', membershipId: 'other-member', referenceType: 'dispatch', referenceId: 'other-message', recipientEmail: 'other@example.invalid' })) {
  test(`changing ${field} resets disclosure, confirmation and action state`, () => {
    assert.notEqual(render().key, render({ props: { [field]: value } }).key);
  });
}

for (const state of [
  { ok: true, dispatchId: 'receipt', message: 'Payment email queued to resend.' },
  { ok: true, dispatchId: 'receipt', message: 'Already queued; no duplicate created.' },
  { ok: false, message: 'Payment is paid; nothing queued.' },
]) {
  test(`feedback remains outside the closed disclosure: ${state.message}`, () => {
    const { tree, html, refreshes } = render({ state });
    const disclosure = nodes(tree, 'details')[0];
    assert.ok(!disclosure.props.open);
    assert.ok(!nodes(disclosure, 'p').some(node => node.props.role));
    const feedback = nodes(tree, 'p').filter(node => node.props.role);
    assert.equal(feedback.length, 1);
    assert.equal(feedback[0].props.role, state.ok ? 'status' : 'alert');
    assert.ok(html.indexOf('role=') > html.indexOf('</details>'));
    assert.equal(refreshes, state.ok ? 1 : 0);
    for (const button of nodes(tree, 'button')) assert.equal(button.props.disabled, state.ok);
  });
}

test('pending keeps both confirmation and submit disabled without expanding tools', () => {
  const { tree, html } = render({ pending: true });
  assert.ok(!nodes(tree, 'details')[0].props.open);
  assert.equal(nodes(tree, 'input').find(node => node.props.name === 'confirmed').props.disabled, true);
  assert.equal(nodes(tree, 'button')[0].props.disabled, true);
  assert.match(html, /Queuing/);
});

test('whole-source inventory retains player-only eligibility, previews and shared inbox disclosure', () => {
  const consumers = [];
  function scan(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = path.join(dir, item.name);
      if (item.isDirectory()) scan(name);
      else if (/\.[jt]sx?$/.test(name) && fs.readFileSync(name, 'utf8').includes('<PlayerPaymentEmailResend')) consumers.push(name);
    }
  }
  scan('src');
  console.log('Individual resend consumers:', consumers.join(', '));
  const page = fs.readFileSync('src/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/page.tsx', 'utf8');
  assert.match(page, /canResendPlayerPaymentEmail\(item\)/);
  assert.match(page, /<PlayerPaymentEmailResend\b/);
  assert.match(page, /<EmailHtmlPreview\b/);
  assert.match(page, /<TeamCommunicationsComposer\b/);
  const shared = fs.readFileSync('src/components/admin/messages/AdminEmailResendPanel.tsx', 'utf8');
  assert.match(shared, /<details key=\{threadId\} className="group\/resend">/);
});
