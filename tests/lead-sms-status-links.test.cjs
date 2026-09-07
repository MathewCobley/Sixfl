const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const filename = path.resolve(__dirname, '../src/components/admin/leads/LeadSmsStatusLines.tsx');
const instance = new Module(filename, module);
instance.filename = filename;
instance.paths = Module._nodeModulePaths(path.dirname(filename));
const native = instance.require.bind(instance);
instance.require = (name) => name === 'next/link' ? { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { ...rest, href }, children) } : native(name);
instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
const Lines = instance.exports.default;
test('SMS status renders a real View reply link, not just tooltip text', () => {
  const html = renderToStaticMarkup(React.createElement(Lines, { lines: [{ text: 'Incoming SMS · 3 Sep', tone: 'success', title: 'Where do we play?', href: '/admin/leads/lead-a#lead-reply-evidence', linkText: 'View reply' }] }));
  assert.match(html, /href="\/admin\/leads\/lead-a#lead-reply-evidence"/); assert.match(html, />View reply<\/a>/);
  assert.match(html, /Where do we play/); assert.doesNotMatch(html, /<button/);
});
test('review records link to evidence without an unverified reply claim', () => {
  const html = renderToStaticMarkup(React.createElement(Lines, { lines: [{ text: 'Reply record needs checking', tone: 'warning', href: '/admin/leads/lead-a#lead-reply-evidence', linkText: 'Review reply record' }] }));
  assert.match(html, /Review reply record/); assert.doesNotMatch(html, /reply received/);
});
test('untrusted non-lead URLs cannot become status links', () => {
  const html = renderToStaticMarkup(React.createElement(Lines, { lines: [{ text: '<script>test</script>', tone: 'warning', href: 'javascript:alert(1)' }] }));
  assert.doesNotMatch(html, /href=/); assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
});
test('owning status component mounts links and offers read-only refresh', () => {
  const file = fs.readFileSync(path.resolve(__dirname, '../src/components/admin/leads/LeadConfirmationQuickSendButton.tsx'), 'utf8');
  assert.match(file, /<LeadSmsStatusLines lines=\{smsStatus.lines\}/);
  assert.match(file, /onClick=\{\(\) => void refreshSmsStatus\(true\)\}/);
  assert.match(file, /Date.now\(\) - sharedStatusRequestedAt > 30_000/);
});
