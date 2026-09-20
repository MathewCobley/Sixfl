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


const captainPayments = fs.readFileSync(
  'src/app/captain/team/[teamid]/payments/page.tsx',
  'utf8',
);
const playerAccounts = fs.readFileSync(
  'src/app/captain/team/[teamid]/player-payments/accounts/page.tsx',
  'utf8',
);
const copyControl = fs.readFileSync(
  'src/components/captain/CopyPlayerPaymentLinkButton.tsx',
  'utf8',
);

test('captain payments surfaces one place for all outstanding player payment links', () => {
  assert.match(captainPayments, /Outstanding player payment links/);
  assert.match(captainPayments, /View player payment links/);
  assert.match(captainPayments, /player-payments\/accounts/);
  assert.match(captainPayments, /PlayerFeeLedgerState/);
  assert.match(captainPayments, /"balancePence" > 0/);
});

test('outstanding player payments are grouped by player and link to the player ledger', () => {
  assert.match(playerAccounts, /Outstanding player payments/);
  assert.match(playerAccounts, /Every unpaid player fee for this team is grouped by player/);
  assert.match(playerAccounts, /COALESCE\(/);
  assert.match(playerAccounts, /Open player ledger/);
  assert.match(playerAccounts, /player-payments\/account\/\$\{account\.feeId\}/);
  assert.match(playerAccounts, /Open payment link/);
  assert.match(playerAccounts, /CopyPlayerPaymentLinkButton/);
  assert.match(playerAccounts, /collection paused/);
  assert.match(playerAccounts, /repayment arrangement active/);
});

test('captain payment-link list remains native React with explicit captain authorization', () => {
  assert.match(playerAccounts, /await requireCaptain\(teamid\)/);
  assert.match(copyControl, /navigator\.clipboard\.writeText\(url\)/);
  for (const source of [captainPayments, playerAccounts, copyControl]) {
    assert.doesNotMatch(source, /MutationObserver|document\.querySelector|document\.querySelectorAll/);
  }
});
