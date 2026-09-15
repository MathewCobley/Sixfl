const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const reconciliation = fs.readFileSync(
  'src/components/payments/PaymentLedgerReconciliation.tsx',
  'utf8',
);

test('player contribution names link to the existing player ledger account', () => {
  assert.match(
    reconciliation,
    /href=\{`\.\/player-payments\/account\/\$\{row\.id\}`\}/,
  );
  assert.match(reconciliation, />\{row\.name\}<\/Link>/);
});

test('player ledger link is native React and does not use a DOM bridge', () => {
  assert.doesNotMatch(
    reconciliation,
    /MutationObserver|document\.querySelector|document\.querySelectorAll/,
  );
});
