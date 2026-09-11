const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const routePath = 'src/app/api/admin/payments/adjust-charge/route.ts';

// Execute the actual route, financial summary and Prisma fixture-lock extension.
// Only external delivery/credit refresh and authentication I/O are isolated.
function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    let full = path.resolve(root, file);
    if (!fs.existsSync(full)) full += '.ts';
    if (cache.has(full)) return cache.get(full).exports;
    let source = fs.readFileSync(full, 'utf8');
    if (file === routePath && process.env.FEE_REDUCTION_NEGATIVE_CONTROL === '1') {
      const before = source;
      source = source.replace(/const changed = charge.fixture.homeTeamId === charge.teamId[\s\S]*?if \(changed !== 1\)/,
        'const changed = (await tx.fixture.update({ where: { id: charge.fixture.id }, data: { homeMatchFeePence: newBaseChargePence } }), 1); if (changed !== 1)');
      assert.notEqual(source, before, 'negative control must restore the old locked write');
    }
    const module = { exports: {} }; cache.set(full, module);
    const compiled = ts.transpileModule(source, { fileName: full, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } });
    new Function('require', 'module', 'exports', 'globalThis', 'console', compiled.outputText)(id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === '@prisma/client' || id === 'react' || id === 'react/jsx-runtime') return require(id);
      if (id.startsWith('@/lib/payments/')) return load('src/lib/payments/' + id.slice('@/lib/payments/'.length));
      if (id.startsWith('./')) return load(path.relative(root, path.resolve(path.dirname(full), id)));
      throw new Error('Unexpected dependency / I/O blocked: ' + id);
    }, module, module.exports, globals, { ...console, error() {} });
    return module.exports;
  }
  return load;
}
function routeFor(db, { denied = false } = {}) {
  const effects = { cancellations: [], credits: [], invalidations: [] };
  const mocks = {
    '@/lib/prisma': { prisma: db },
    '@/lib/requireAdmin': { requireAdmin: async () => {
      if (denied) throw new Error('ADMIN_REQUIRED');
      return { user: { id: 'test-admin' } };
    } },
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    'next/cache': { revalidatePath: p => effects.invalidations.push(p) },
    '@/lib/payments/fixture-match-fees': { cancelQueuedMatchFeeNotificationDispatches: async ids => effects.cancellations.push(ids) },
    '@/lib/payments/team-credits': { syncTeamCreditLedgerSources: async ids => effects.credits.push(ids) },
  };
  const post = loader(mocks)(routePath).POST;
  return { effects, post: (chargeId, waivePence = 1000, reason = 'Goodwill adjustment') => post(new Request('https://sixfl.example/api/admin/payments/adjust-charge', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chargeId, waivePence, reason }),
  })) };
}
function memory({ side = 'home', fee = 4000, otherFee = 3600, late = 0, paid = 0, fixtureStatus = 'COMPLETED', status = 'OPEN', fallback = false, noFixture = false, conflict = false, mismatched = false } = {}) {
  const fixture = { id: 'fixture', homeTeamId: 'a', awayTeamId: 'b', status: fixtureStatus,
    homeMatchFeePence: side === 'home' ? (fallback ? null : fee) : otherFee,
    awayMatchFeePence: side === 'away' ? (fallback ? null : fee) : otherFee,
    matchFeePence: fee, kickoffAt: '2026-09-09T18:00:00Z', pitch: '1', round: 4 };
  const charge = { id: 'charge', teamId: mismatched ? 'other' : side === 'home' ? 'a' : 'b', fixtureId: noFixture ? null : 'fixture', amountPence: fee + late,
    status, updatedAt: new Date('2026-09-09T19:00:00Z'), description: 'Original audit', latePaymentFeeStatus: late ? 'APPLIED' : 'NONE', latePaymentFeeAmountPence: late,
    lastStripeCheckoutUrl: 'old-url', lastStripeCheckoutSessionId: 'old-session', lastStripeCheckoutCreatedAt: new Date(), lastStripeCheckoutAmountPence: fee + late };
  const receipts = paid ? [{ id: 'receipt', amountPence: paid, notes: 'Actual money received' }] : [];
  const state = { fixture, charge, receipts, reads: 0, sql: [] };
  const db = {
    paymentCharge: { findUnique: async () => { state.reads++; return structuredClone({ ...charge, fixture: noFixture ? null : fixture, transactions: receipts }); } },
    playerMatchFee: { findMany: async () => [] },
    $transaction: async callback => {
      const oldF = structuredClone(fixture), oldC = structuredClone(charge);
      try {
        return await callback({
          fixture: { update: async () => { throw new Error('This fixture has already been completed and is locked, so it cannot be changed.'); } },
          $executeRaw: async (strings, ...values) => {
            const sql = strings.join('?'); state.sql.push(sql);
            const field = sql.includes('SET "homeMatchFeePence"') ? 'homeMatchFeePence' : 'awayMatchFeePence';
            assert.match(sql, /UPDATE "Fixture" SET "(?:home|away)MatchFeePence" = \?, "updatedAt" = NOW\(\)/);
            assert.doesNotMatch(sql, /SET "status"|SET "kickoffAt"|SET "matchFeePence"/);
            const [amount, id, teamId, fallbackFee, expectedFee] = values;
            if (fixture.id !== id || teamId !== fixture[field === 'homeMatchFeePence' ? 'homeTeamId' : 'awayTeamId'] || (fixture[field] ?? fixture.matchFeePence ?? fallbackFee) !== expectedFee) return 0;
            fixture[field] = amount; return 1;
          },
          paymentCharge: { updateMany: async ({ where, data }) => {
            if (conflict || charge.amountPence !== where.amountPence) return { count: 0 };
            Object.assign(charge, data); return { count: 1 };
          } },
        });
      } catch (e) { Object.assign(fixture, oldF); Object.assign(charge, oldC); throw e; }
    },
  };
  return { state, db, ...routeFor(db) };
}
for (const side of ['home', 'away']) test(`completed fixtures: reduce ${side} fee without unlocking match or altering receipts`, async () => {
  const h = memory({ side, late: 1000, paid: 1500 });
  const original = structuredClone(h.state);
  const response = await h.post('charge');
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.newBaseChargePence, 3000); assert.equal(body.newAmountPence, 4000);
  assert.equal(body.outstandingPence, 2500); assert.equal(body.status, 'PART_PAID');
  assert.deepEqual(h.state.fixture, { ...original.fixture, [side + 'MatchFeePence']: 3000 });
  assert.deepEqual(h.state.receipts, original.receipts);
  assert.equal(h.state.charge.latePaymentFeeStatus, 'APPLIED');
  assert.equal(h.state.charge.lastStripeCheckoutUrl, null);
  assert.match(h.state.charge.description, /Original audit[\s\S]*Reason: Goodwill adjustment[\s\S]*test-admin/);
  assert.deepEqual(h.effects.cancellations, [['charge']]); assert.deepEqual(h.effects.credits, [[side === 'home' ? 'a' : 'b']]);
});
test('scheduled, legacy shared-fee, standalone and zero-fee reductions still work', async () => {
  for (const options of [{ fixtureStatus: 'SCHEDULED' }, { fallback: true }, { noFixture: true }, { paid: 4000 }]) {
    const h = memory(options); assert.equal((await h.post('charge', 4000)).status, 200);
    assert.equal(h.state.charge.amountPence, 0); assert.equal(h.state.charge.status, 'PAID');
    assert.equal(h.state.fixture.matchFeePence, 4000);
  }
});
test('void, invalid and excessive reductions cannot change fees', async () => {
  for (const [options, amount, reason, status] of [[{ status: 'VOID' }, 100, 'reason', 409], [{ mismatched: true }, 100, 'reason', 409], [{}, -1, 'reason', 400], [{}, 0, 'reason', 400], [{}, 1.1, 'reason', 400], [{}, 100, '', 400], [{ late: 1000 }, 4500, 'reason', 409]]) {
    const h = memory(options), before = structuredClone({ f: h.state.fixture, c: h.state.charge });
    assert.equal((await h.post('charge', amount, reason)).status, status);
    assert.deepEqual({ f: h.state.fixture, c: h.state.charge }, before);
    assert.equal(h.effects.cancellations.length, 0);
  }
});
test('non-admin calls cannot read or change charges', async () => {
  const h = memory(); const denied = routeFor(h.db, { denied: true });
  await assert.rejects(denied.post('charge'), /ADMIN_REQUIRED/);
  assert.equal(h.state.reads, 0); assert.equal(h.state.sql.length, 0);
});
test('charge conflicts roll back the fixture fee and preserve both audit records', async () => {
  const h = memory({ conflict: true }); const before = structuredClone({ f: h.state.fixture, c: h.state.charge });
  assert.equal((await h.post('charge')).status, 409);
  assert.deepEqual({ f: h.state.fixture, c: h.state.charge }, before);
  assert.equal(h.effects.cancellations.length, 0); assert.equal(h.effects.credits.length, 0);
});
test('the native payments control still calls the shared protected reduction route', () => {
  const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
  const Buttons = loader({ 'next/navigation': { useRouter: () => ({ refresh() {} }) } })('src/components/admin/payments/AdminChargeAdjustmentButtons.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Buttons, { chargeId: 'charge', teamName: 'Test', title: 'Test fee', amountPence: 5000, outstandingPence: 3500, latePaymentFeeStatus: 'APPLIED', latePaymentFeeAmountPence: 1000 }));
  assert.match(html, /Reduce match fee/); assert.match(html, /Waive outstanding/);
  assert.ok(fs.readFileSync(path.join(root, 'src/components/admin/payments/AdminChargeAdjustmentButtons.tsx'), 'utf8').includes('/api/admin/payments/adjust-charge'));
});

test('real PostgreSQL and fixture lock: reduction, rollback, concurrency and subsequent sync', { skip: !process.env.FEE_REDUCTION_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.FEE_REDUCTION_TEST_DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/sixfl_fee_reduction_test', 'Only the disposable CI database is allowed');
  const raw = new PrismaClient({ datasourceUrl: url.href });
  const db = loader({}, { prisma: raw })('src/lib/prisma.ts').prisma;
  const leagueId = randomUUID(), a = randomUUID(), b = randomUUID();
  const fixtureId = randomUUID(), chargeId = randomUUID();
  try {
    await raw.league.create({ data: { id: leagueId, name: 'Fee reduction test', slug: leagueId } });
    for (const id of [a,b]) await raw.team.create({ data: { id, name: id, claimCode: id } });
    await raw.fixture.create({ data: { id: fixtureId, leagueId, homeTeamId: a, awayTeamId: b, status: 'COMPLETED', kickoffAt: new Date('2026-09-09T18:00:00Z'), publishedAt: new Date(), matchFeePence: 4000, homeMatchFeePence: 4000, awayMatchFeePence: 3600, pitch: '1', round: 4 } });
    await raw.matchResult.create({ data: { fixtureId, homeScore: 2, awayScore: 1 } });
    await raw.paymentCharge.create({ data: { id: chargeId, teamId: a, leagueId, fixtureId, title: 'Match fee', amountPence: 5000, latePaymentFeeStatus: 'APPLIED', latePaymentFeeAmountPence: 1000, description: 'Original note' } });
    await raw.paymentCharge.create({ data: { teamId: b, leagueId, fixtureId, title: 'Opponent fee', amountPence: 3600 } });
    await raw.paymentTransaction.create({ data: { teamId: a, chargeId, amountPence: 1500, paidAt: new Date(), notes: 'Actual receipt' } });
    const before = await raw.fixture.findUnique({ where: { id: fixtureId }, include: { result: true } });
    const receipts = await raw.paymentTransaction.findMany({ where: { chargeId } });
    const h = routeFor(db);
    assert.equal((await h.post(chargeId)).status, 200);
    const after = await raw.fixture.findUnique({ where: { id: fixtureId }, include: { result: true } });
    assert.deepEqual({ ...after, homeMatchFeePence: before.homeMatchFeePence, updatedAt: before.updatedAt }, before);
    assert.equal(after.homeMatchFeePence, 3000);
    assert.deepEqual(await raw.paymentTransaction.findMany({ where: { chargeId } }), receipts);
    for (const data of [{ status: 'SCHEDULED' }, { pitch: '2' }, { kickoffAt: new Date() }, { homeMatchFeePence: 8000 }]) {
      await assert.rejects(db.fixture.update({ where: { id: fixtureId }, data }), /locked/);
    }
    await assert.rejects(db.fixture.delete({ where: { id: fixtureId } }), /locked/);
    await assert.rejects(db.fixture.updateMany({ where: { id: fixtureId }, data: { pitch: '2' } }), /locked/);
    await assert.rejects(db.fixture.deleteMany({ where: { id: fixtureId } }), /locked/);
    // An intervening charge change causes the already-executed fee SQL to roll back.
    const conflictDb = { ...db, $transaction: cb => db.$transaction(async tx => cb({ ...tx, paymentCharge: { updateMany: async () => ({ count: 0 }) } })) };
    assert.equal((await routeFor(conflictDb).post(chargeId, 100)).status, 409);
    assert.equal((await raw.fixture.findUnique({ where: { id: fixtureId } })).homeMatchFeePence, 3000);
    // Both calls read the same snapshot before either writes. Only one commits.
    const originalFind = db.paymentCharge.findUnique.bind(db.paymentCharge);
    let count = 0, release; const barrier = new Promise(r => { release = r; });
    const concurrentDb = { ...db, paymentCharge: { ...db.paymentCharge, findUnique: async args => { const value = await originalFind(args); if (++count === 2) release(); await barrier; return value; } } };
    const pair = await Promise.all([routeFor(concurrentDb).post(chargeId, 100), routeFor(concurrentDb).post(chargeId, 100)]);
    assert.deepEqual(pair.map(r => r.status).sort(), [200,409]);
    const current = await raw.fixture.findUnique({ where: { id: fixtureId } });
    assert.equal(current.homeMatchFeePence, 2900);
    // Exercise the real sync with updated source fees; no notification provider runs.
    const sync = loader({
      '@/lib/prisma': { prisma: db }, '@/lib/datetime/london': { formatDateTimeInLondon: () => '9 September' },
      '@/lib/notifications/service': { queueNotificationFromTemplate: () => { throw new Error('NO_SEND'); } },
      '@/lib/notifications/team-contacts': { upsertTeamNotificationRecipient: () => { throw new Error('NO_SEND'); } },
      '@/lib/stripe/client': { getPublicSiteUrl: () => 'https://example.invalid' },
      '@/lib/payments/match-day-billing': { getMatchFeePaymentRequestScheduledFor: () => null },
      'node:crypto': require('node:crypto'),
    })('src/lib/payments/fixture-match-fees.ts');
    await sync.syncFixtureMatchFeeCharges({ db, fixtureId, leagueId, leagueName: 'Test', kickoffAt: current.kickoffAt, homeTeam: { id: a, name: a }, awayTeam: { id: b, name: b }, homeMatchFeePence: current.homeMatchFeePence, awayMatchFeePence: current.awayMatchFeePence });
    assert.equal((await raw.paymentCharge.findUnique({ where: { id: chargeId } })).amountPence, 3900);
    assert.deepEqual(await raw.paymentTransaction.findMany({ where: { chargeId } }), receipts);
  } finally { await raw.$disconnect(); }
});
