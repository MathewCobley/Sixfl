const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(id => id.startsWith('@/') ? load('src/' + id.slice(2) + '.ts') : require(id), module, module.exports);
  cache.set(file, module.exports); return module.exports;
}
const policy = load('src/lib/payments/player-payment-warning-policy.ts');
test('warning fingerprint tolerates JSONB key reordering but rejects changed links and array order', () => {
  const sent = [{ token: 'dispatch-0', url: 'https://sixfl.co.uk/pay/player-match-fee/one' }];
  const stored = [{ url: sent[0].url, token: 'dispatch-0' }];
  assert.equal(policy.warningFingerprint(sent), policy.warningFingerprint(stored));
  assert.notEqual(policy.warningFingerprint(sent), policy.warningFingerprint([{ ...stored[0], url: 'https://example.invalid/wrong' }]));
  assert.notEqual(policy.warningFingerprint([1, 2]), policy.warningFingerprint([2, 1]));
});
test('a malformed non-ASCII signature fails closed with a controlled preview error', () => {
  process.env.NEXTAUTH_SECRET ||= 'warning-policy-test-only';
  const now = new Date('2026-09-08T12:00:00Z');
  const token = policy.createWarningTicket({ actorId: 'admin', feeId: 'fee', channel: 'EMAIL', deadline: '2026-09-09T12:00:00Z', fingerprint: 'hash' }, now);
  assert.throws(() => policy.readWarningTicket(token.split('.')[0] + '.' + 'é'.repeat(43), 'admin', now), policy.PaymentWarningError);
});
test('linked membership identity owns contacts; no fallback into a different prospect and destination metadata is validated', () => {
  const source = fs.readFileSync('src/lib/payments/player-payment-warning.ts', 'utf8');
  assert.ok(source.includes('emailAddress(fee.teamMember ? fee.teamMember.user.email : fee.prospect?.email)'));
  assert.ok(source.includes('const playerName = fee.teamMember ? fee.teamMember.user.name?.trim() :'));
  assert.ok(source.includes('warningFingerprint(shortened.links) !== warningFingerprint(meta.smsShortLinks ?? [])'));
});
