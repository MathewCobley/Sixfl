const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const actions = fs.readFileSync('src/app/captain/team/[teamid]/player-payments/actions.ts','utf8');
const page = fs.readFileSync('src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx','utf8');

test('settled controlled ledgers do not lock current squad collection', () => {
  assert.match(actions, /state\?\.controlled === true && state\.balancePence > 0/);
  assert.doesNotMatch(actions, /isPlayerFeeLedgerControlled\(existing\.id\)/);
  assert.match(page, /\.controlled && \(ledgerByFee\.get\(player\.fee\.id\)\?\.balancePence \?\? 0\) > 0/);
});

test('positive controlled balances remain protected and history wording is clear', () => {
  assert.match(page, /Outstanding repayment balance protected/);
  assert.match(page, />Payment history<\/Link>/);
  assert.doesNotMatch(page, />Player account<\/Link>/);
});
