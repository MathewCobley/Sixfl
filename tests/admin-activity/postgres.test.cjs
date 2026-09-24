const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paymentHarness, fee } = require('./load.cjs');

// The database supplies SQL semantics only. All test data are read-only CTEs;
// this test does not create tables or insert/update/delete any database rows.
test('exact reference matching excludes mirrors even when the receipt is outside the recent window', {
  skip: !process.env.ACTIVITY_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.ACTIVITY_TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/activity_test');
  const { PrismaClient, Prisma } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const names = ['legacy', 'modern', 'case', 'prefix', 'prefix-long', 'unlinked', 'wrong-team', 'refunded-only'];
  const feeRows = names.map((name) => Prisma.sql`(${name}::text, 'team'::text, 'PAID'::text, NOW(), 571)`);
  const receiptRows = [
    ['Player fee ID: legacy', 'team', 571],
    ['Player ledger repayment\nAccount fee reference: modern', 'team', 200],
    ['PLAYER FEE ID:\n case', 'team', 571],
    ['Player fee ID: prefix-long', 'team', 571],
    ['Player fee ID: wrong-team', 'different', 571],
    ['Player fee ID: refunded-only', 'team', -571],
  ].map(([notes, teamId, amount]) => Prisma.sql`(${teamId}::text, ${amount}::int, ${notes}::text)`);
  try {
    const h = paymentHarness({
      receipts: [], // No matching receipt is in the displayed receipt page.
      fees: names.map((name) => fee(name)),
      query: (sql) => db.$queryRaw(Prisma.sql`
        WITH "PlayerMatchFee" ("id", "teamId", "status", "paidAt", "amountPence") AS (VALUES ${Prisma.join(feeRows)}),
             "PaymentTransaction" ("teamId", "amountPence", "notes") AS (VALUES ${Prisma.join(receiptRows)})
        ${sql}
      `),
    });
    const items = await h.run(50);
    assert.deepEqual(items.map((item) => item.id).sort(),
      ['prefix', 'unlinked', 'wrong-team', 'refunded-only'].map((id) => `player-payment:${id}`).sort());
  } finally { await db.$disconnect(); }
});
