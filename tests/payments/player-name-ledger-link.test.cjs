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


const playerAccounts = fs.readFileSync(
  'src/app/captain/team/[teamid]/player-payments/accounts/page.tsx',
  'utf8',
);
const playerLedger = fs.readFileSync(
  'src/lib/payments/player-ledger.ts',
  'utf8',
);
const playerStatement = fs.readFileSync(
  'src/components/payments/PlayerLedgerStatement.tsx',
  'utf8',
);
const orphanAdmin = fs.readFileSync(
  'src/app/(admin)/admin/payments/orphaned-player-fees/page.tsx',
  'utf8',
);

test('captain outstanding payment list recovers historical identity instead of showing Historical player', () => {
  assert.match(playerAccounts, /getHistoricalPlayerFeeIdentities/);
  assert.match(playerAccounts, /Player identity needs SIXFL review/);
  assert.doesNotMatch(playerAccounts, /Historical player/);
  assert.match(playerAccounts, /Payment link hidden until identified/);
  assert.match(playerAccounts, /SIXFL needs to identify this player/);
});

test('player ledger account recovers the original payment recipient when the live link was lost', () => {
  assert.match(playerLedger, /NotificationRecipient/);
  assert.match(playerLedger, /player-match-fee:/);
  assert.match(playerLedger, /identityRecoveredFromHistory/);
  assert.match(playerLedger, /Player identity needs SIXFL review/);
});

test('admin orphan repair shows the recovered historical recipient before reattaching', () => {
  assert.match(orphanAdmin, /getHistoricalPlayerFeeIdentities/);
  assert.match(orphanAdmin, /Original payment recipient recovered/);
  assert.match(orphanAdmin, /historical\?\.email/);
});

test('player payment history is newest first and opening balances use the original fixture date', () => {
  assert.match(playerStatement, /Most recent activity is shown first/);
  assert.match(playerStatement, /Balance brought forward/);
  assert.match(playerStatement, /left\.sequence < right\.sequence \? 1 : -1/);
  assert.match(playerStatement, /e\.kind === "OPENING_BALANCE" && fee\?\.fixture\?\.kickoffAt/);
  assert.match(playerStatement, /runningBalanceByEntryId/);
  assert.doesNotMatch(playerStatement, /Opening balances use the amounts already recorded/);
});
