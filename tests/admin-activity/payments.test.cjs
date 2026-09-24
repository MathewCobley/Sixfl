const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, paymentHarness, fee, receipt, at } = require('./load.cjs');

for (const notes of [
  'Player match fee paid online. Player fee ID: fee-1',
  'Player ledger repayment. Account fee reference: fee-1',
  'PLAYER FEE ID:\n fee-1',
]) {
  test(`receipt and PAID state appear once: ${notes}`, async () => {
    const h = paymentHarness({ receipts: [receipt('r1', { notes })], fees: [fee()], fallbackIds: ['fee-1'] });
    const items = await h.run(100);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'PLAYER_PAYMENT');
    assert.equal(items[0].title, 'Ethan Cuthbertson paid £5.71');
    assert.match(items[0].detail, /NEO Mercy/);
    assert.match(items[0].href, /teamId=team&view=playerFees/);
  });
}

test('two genuine equal-value receipts and direct team cash all remain', async () => {
  const receipts = [receipt('one'), receipt('two'), receipt('cash', { notes: null, method: 'CASH' })];
  const items = await paymentHarness({ receipts, fees: [fee()], fallbackIds: ['fee-1'] }).run(100);
  assert.equal(items.length, 3);
  assert.equal(items.filter((item) => item.kind === 'PLAYER_PAYMENT').length, 2);
  assert.equal(items.filter((item) => item.kind === 'TEAM_PAYMENT').length, 1);
  assert.equal(new Set(items.map((item) => item.id)).size, 3);
});

test('partial and capped payments show actual receipts, not the assigned fee', async () => {
  const h = paymentHarness({
    receipts: [receipt('part', { amountPence: 200 }), receipt('rest', { amountPence: 300, paidAt: at(10) })],
    fees: [fee('fee-1', { amountPence: 900, paidAt: null })],
  });
  const items = await h.run(100);
  assert.deepEqual(items.map((item) => item.title), ['Ethan Cuthbertson paid £2.00', 'Ethan Cuthbertson paid £3.00']);
  assert.equal(h.calls.find(([name]) => name === 'fees')[1].where.status, undefined);
});

test('historic fee-only payments survive: equal amounts alone never deduplicate', async () => {
  const items = await paymentHarness({
    receipts: [receipt('cash', { notes: null })], fees: [fee()], fallbackIds: ['fee-1'],
  }).run(100);
  assert.equal(items.length, 2);
  assert.equal(items[1].id, 'player-payment:fee-1');
});

test('refunds stay separate from a genuine prior payment', async () => {
  const items = await paymentHarness({ receipts: [receipt('refund', { amountPence: -571 })], fees: [fee()], fallbackIds: ['fee-1'] }).run(100);
  assert.equal(items.length, 2);
  assert.match(items[0].title, /received a £5.71 refund/);
  assert.equal(items[1].title, 'Ethan Cuthbertson paid £5.71');
});

test('missing, prospect and wrong-team identities do not invent a payer', async () => {
  const missing = await paymentHarness({ receipts: [receipt()] }).run(100);
  assert.equal(missing[0].title, 'Player paid £5.71');
  const prospect = fee('fee-1', { teamMember: null, prospect: { firstName: 'Alex', lastName: 'Test', email: null } });
  const identified = await paymentHarness({ receipts: [receipt()], fees: [prospect] }).run(100);
  assert.equal(identified[0].title, 'Alex Test paid £5.71');
  const otherTeam = fee('fee-1', { team: { id: 'other', name: 'Other' } });
  const guarded = await paymentHarness({ receipts: [receipt()], fees: [otherTeam], fallbackIds: ['fee-1'] }).run(100);
  assert.equal(guarded.length, 2);
  assert.equal(guarded[0].title, 'Player paid £5.71');
});

test('fallback checks complete receipt history before LIMIT, not only the displayed page', async () => {
  const h = paymentHarness();
  await h.run(5000);
  const sql = h.calls.find(([name]) => name === 'sql')[1];
  assert.match(sql.sql, /NOT EXISTS[\s\S]*Player fee ID:[\s\S]*ORDER BY[\s\S]*LIMIT/);
  assert.match(sql.sql, /Account fee reference:/);
  assert.doesNotMatch(sql.sql, /receipt\."paidAt"\s*[><=]/);
  assert.equal(h.calls.find(([name]) => name === 'receipts')[1].take, 100);
});

test('mixed history is globally sorted and limited to 50 after deduplication', async () => {
  const queries = [];
  const empty = { findMany: async () => [] };
  const payments = Array.from({ length: 35 }, (_, i) => ({ id: `receipt:${i}`, kind: 'PLAYER_PAYMENT', title: 'Player paid', detail: '', href: '/admin/payments', occurredAt: at(i * 2) }));
  const leads = Array.from({ length: 35 }, (_, i) => ({ id: `lead-${i}`, interestType: 'TEAM', contactName: 'Test', teamName: 'Test team', area: '', source: 'WEB', createdAt: at(i * 2 + 1) }));
  const prisma = {
    portalMessage: empty, messageEntry: empty,
    interestLead: { findMany: async (args) => { queries.push(args); return leads; } },
    fixtureCaptainConfirmation: empty, matchResult: empty, resultDispute: empty,
    $queryRaw: async () => [],
  };
  const { getAdminLatestActivity } = loadSource('src/lib/admin/latest-activity.ts', {
    '@/lib/prisma': { prisma }, './payment-activity': { getAdminPaymentActivity: async () => payments },
  });
  const items = await getAdminLatestActivity(50);
  assert.equal(items.length, 50);
  assert.equal(new Set(items.map((item) => item.id)).size, 50);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].occurredAt >= items[i].occurredAt);
  assert.equal(items[0].occurredAt.getTime(), at(69).getTime());
  assert.equal(items[49].occurredAt.getTime(), at(20).getTime());
  assert.equal((await getAdminLatestActivity(5000)).length, 50);
  assert.equal((await getAdminLatestActivity(5)).length, 5);
  assert.ok(queries[0].take >= 50);
});

test('admin-only confirmations, results and disputes stay excluded', async () => {
  const empty = { findMany: async () => [] };
  const prisma = {
    portalMessage: empty, messageEntry: empty, interestLead: empty,
    fixtureCaptainConfirmation: { findMany: async () => [{ confirmedByUser: { role: 'ADMIN' } }] },
    matchResult: { findMany: async () => [{ enteredByUser: { role: 'ADMIN' } }] },
    resultDispute: { findMany: async () => [{ createdByUser: { role: 'ADMIN' } }] },
    $queryRaw: async () => [],
  };
  const { getAdminLatestActivity } = loadSource('src/lib/admin/latest-activity.ts', {
    '@/lib/prisma': { prisma }, './payment-activity': { getAdminPaymentActivity: async () => [] },
  });
  assert.deepEqual(await getAdminLatestActivity(), []);
});
