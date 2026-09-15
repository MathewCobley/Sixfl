const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, beforeEach, after } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PrismaClient, Prisma } = require('@prisma/client');

// These tests deliberately refuse every non-disposable database. No provider
// request, real order or production team is used by this suite.
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/sixfl_kit_offer_test', 'Use only the disposable sixfl_kit_offer_test PostgreSQL database.');
const db = new PrismaClient();
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)((name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
const service = load('src/lib/kits/free-kit-offer.ts', { '@/lib/prisma': { prisma: db } });
const sql = (query) => db.$executeRawUnsafe(query);
const state = (teamId = 'lead-team') => service.getTeamFreeKitOffer(teamId);
async function set(teamId, enabled, overrides = {}) {
  const current = await state(teamId);
  return service.setTeamFreeKitOffer({ teamId, enabled, actorUserId: 'admin', expectedRevision: current?.revision || '', reason: 'Test administrator decision', ...overrides });
}
const nextMock = { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
const common = {
  '@/lib/prisma': { prisma: db },
  '@/lib/kits/free-kit-offer': service,
  '@/lib/kits/constants': { TEAM_KIT_QUANTITY: 7, TEAM_KIT_MAX_QUANTITY: 30 },
  '@/lib/requireCaptain': { requireCaptain: async () => ({ user: { id: 'captain' } }) },
  'next/server': nextMock,
};

before(async () => {
  global.fetch = async () => { throw new Error('Provider HTTP is forbidden in free-kit tests'); };
  for (const statement of [
    'CREATE TABLE IF NOT EXISTS "League" (id text PRIMARY KEY, "freeKitOfferEnabled" boolean DEFAULT true)',
    'CREATE TABLE IF NOT EXISTS "User" (id text PRIMARY KEY, name text, email text)',
    'CREATE TABLE IF NOT EXISTS "Team" (id text PRIMARY KEY, name text, "leagueId" text REFERENCES "League"(id), "wantsFreeKit" boolean DEFAULT false, "freeKitOfferExpiredAt" timestamptz, "freeKitOfferExpiryReason" text, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now())',
    'CREATE TABLE IF NOT EXISTS "InterestLead" (id text PRIMARY KEY, "convertedTeamId" text REFERENCES "Team"(id), "wantsFreeKit" boolean DEFAULT false, "createdAt" timestamptz DEFAULT now())',
    'CREATE TABLE IF NOT EXISTS "TeamKitOrder" (id text PRIMARY KEY, "teamId" text REFERENCES "Team"(id), status text, "createdAt" timestamptz DEFAULT now())',
    'CREATE TABLE IF NOT EXISTS "PaymentCharge" (id text PRIMARY KEY, "teamId" text REFERENCES "Team"(id), title text, description text, "amountPence" int DEFAULT 2000, status text, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now())',
    'CREATE TABLE IF NOT EXISTS "PaymentTransaction" (id text PRIMARY KEY, "chargeId" text REFERENCES "PaymentCharge"(id), "amountPence" int DEFAULT 2000)',
    'CREATE TABLE IF NOT EXISTS "TeamFreeKitOfferAudit" (id text PRIMARY KEY, "teamId" text REFERENCES "Team"(id), "previousValue" boolean, "newValue" boolean, "actorUserId" text REFERENCES "User"(id), reason text, "createdAt" timestamptz DEFAULT now())',
  ]) await sql(statement);
});
beforeEach(async () => {
  await sql('TRUNCATE "TeamFreeKitOfferAudit", "PaymentTransaction", "PaymentCharge", "TeamKitOrder", "InterestLead", "Team", "League", "User" CASCADE');
  await sql(`INSERT INTO "League" VALUES ('league', true)`);
  await sql(`INSERT INTO "User" VALUES ('admin', 'Test Admin', 'admin@example.invalid')`);
  await sql(`INSERT INTO "Team" (id, name, "leagueId", "wantsFreeKit") VALUES ('lead-team','Original team','league',false), ('manual-team','Manual team','league',true), ('standard-team','Standard team','league',false)`);
  await sql(`INSERT INTO "InterestLead" (id, "convertedTeamId", "wantsFreeKit") VALUES ('original-lead','lead-team',true)`);
});
after(() => db.$disconnect());

test('original-registration offers can be turned off without rewriting original opt-ins', async () => {
  assert.equal((await state()).enabled, true);
  const result = await set('lead-team', false);
  assert.equal(result.state.enabled, false);
  assert.equal(result.state.includedEligible, false);
  assert.equal(result.state.wantsFreeKit, false);
  assert.equal(result.state.leadWantsFreeKit, true);
  assert.ok(result.state.expiredAt);
  const audit = await db.$queryRawUnsafe('SELECT * FROM "TeamFreeKitOfferAudit"');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].previousValue, true);
  assert.equal(audit[0].newValue, false);
  assert.equal(audit[0].actorUserId, 'admin');
  assert.equal((await state('manual-team')).enabled, true);
});

test('manual grants and original registrations can both be restored', async () => {
  for (const id of ['lead-team', 'manual-team']) {
    await set(id, false);
    assert.equal((await state(id)).includedEligible, false);
    await set(id, true);
    assert.equal((await state(id)).enabled, true);
    assert.equal((await state(id)).includedEligible, true);
    assert.equal((await state(id)).expiredAt, null);
  }
  assert.equal((await state()).leadWantsFreeKit, true);
  assert.equal((await state()).wantsFreeKit, false);
});

test('new manual grants continue to work without altering other teams', async () => {
  await set('standard-team', true, { reason: '' });
  assert.equal((await state('standard-team')).wantsFreeKit, true);
  assert.equal((await state('standard-team')).includedEligible, true);
  assert.equal((await state()).leadWantsFreeKit, true);
});

test('repeating a saved decision is idempotent and a stale opposing edit is rejected', async () => {
  const original = await state();
  await set('lead-team', false);
  const repeat = await set('lead-team', false, { expectedRevision: original.revision });
  assert.equal(repeat.changed, false);
  await assert.rejects(set('lead-team', true, { expectedRevision: original.revision }), (e) => e.code === 'stale_offer');
  const audit = await db.$queryRawUnsafe('SELECT * FROM "TeamFreeKitOfferAudit"');
  assert.equal(audit.length, 1);
});

test('live kit order statuses prevent silent entitlement or order changes', async () => {
  for (const status of ['DRAFT', 'SUBMITTED', 'APPROVED', 'ORDERED', 'FULFILLED']) {
    await sql(`INSERT INTO "TeamKitOrder" VALUES ('order','lead-team','${status}', now())`);
    await assert.rejects(set('lead-team', false), (e) => e.code === 'offer_in_use');
    assert.equal((await state()).enabled, true);
    const orders = await db.$queryRawUnsafe('SELECT * FROM "TeamKitOrder"');
    assert.equal(orders[0].status, status);
    await sql('DELETE FROM "TeamKitOrder"');
  }
});

test('cancelled orders do not prevent switching off or resurrect an allocation', async () => {
  await sql(`INSERT INTO "TeamKitOrder" VALUES ('old-order','lead-team','CANCELLED', now()-interval '1 day')`);
  await set('lead-team', false);
  assert.equal((await state()).includedEligible, false);
});

test('open and paid kit charges, including voided receipts, are protected', async () => {
  for (const status of ['OPEN', 'PAID', 'VOID']) {
    await sql(`INSERT INTO "PaymentCharge" (id,"teamId",title,status) VALUES ('charge','lead-team','Additional kit contribution • Test','${status}')`);
    if (status === 'VOID') await sql(`INSERT INTO "PaymentTransaction" VALUES ('receipt','charge',2000)`);
    await assert.rejects(set('lead-team', false), (e) => e.code === 'offer_in_use');
    assert.equal((await state()).enabled, true);
    await sql('DELETE FROM "PaymentTransaction"');
    await sql('DELETE FROM "PaymentCharge"');
  }
});

test('a new paid order after switching off cannot reactivate seven free kits', async () => {
  await set('lead-team', false);
  await sql(`INSERT INTO "TeamKitOrder" VALUES ('paid-order','lead-team','DRAFT', clock_timestamp()+interval '1 second')`);
  const offer = await state();
  assert.equal(offer.hasExistingOrder, true);
  assert.equal(offer.hasRetainedOrder, false);
  assert.equal(offer.includedEligible, false);
  const route = load('src/app/api/captain/team/[teamid]/legacy-kit-offer/route.ts', common);
  const response = await route.GET(new Request('https://sixfl.co.uk'), { params: Promise.resolve({ teamid: 'lead-team' }) });
  assert.equal(response.body.includedKitQuantity, 0);
  assert.equal(response.body.kitPricePence, 2000);
});

test('historical orders predating an old expiry retain their allocation', async () => {
  await sql(`INSERT INTO "TeamKitOrder" VALUES ('old-order','lead-team','SUBMITTED', now()-interval '2 days')`);
  await sql(`UPDATE "Team" SET "freeKitOfferExpiredAt" = now()-interval '1 day' WHERE id='lead-team'`);
  assert.equal((await state()).enabled, false);
  assert.equal((await state()).includedEligible, true);
});

test('an audit-write failure rolls back the offer change atomically', async () => {
  await assert.rejects(set('lead-team', false, { actorUserId: 'missing-actor' }));
  assert.equal((await state()).enabled, true);
  assert.equal((await state()).expiredAt, null);
  const audit = await db.$queryRawUnsafe('SELECT * FROM "TeamFreeKitOfferAudit"');
  assert.equal(audit.length, 0);
});

test('blank reason and missing administrator/revision fail without mutation', async () => {
  for (const overrides of [{ reason: '' }, { actorUserId: '' }, { expectedRevision: '' }]) {
    await assert.rejects(set('lead-team', false, overrides));
  }
  assert.equal((await state()).enabled, true);
});

test('the native original-registration card contains the off form and the off card contains restore', async () => {
  const feedback = load('src/components/admin/teams/FreeKitOfferFeedback.tsx', {
    'next/navigation': { useSearchParams: () => new URLSearchParams() },
    'react-dom': { useFormStatus: () => ({ pending: false }) },
  });
  const Control = load('src/components/admin/teams/FreeKitOfferControl.tsx', {
    ...common,
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/app/(admin)/admin/teams/[id]/free-kit-actions': { updateManualFreeKitOfferAction: async () => {} },
    './FreeKitOfferFeedback': feedback,
  }).default;
  let html = renderToStaticMarkup(await Control({ teamId: 'lead-team', teamName: 'Original team' }));
  assert.match(html, /Original registration/);
  assert.match(html, /Turn off free kit offer/);
  assert.match(html, /name="enabled" value="false"/);
  assert.match(html, /name="expectedRevision"/);
  assert.doesNotMatch(html, /not removable|Remove manually granted offer/);
  await set('lead-team', false);
  html = renderToStaticMarkup(await Control({ teamId: 'lead-team', teamName: 'Original team' }));
  assert.match(html, /Free kit offer turned off/);
  assert.match(html, /Turn on free kit offer/);
  assert.match(html, /£20 each/);
});

test('server action checks administrator, explicit decision and confirmation before writing', async () => {
  let writes = 0;
  let actor = { id: 'admin' };
  const Action = load('src/app/(admin)/admin/teams/[id]/free-kit-actions.ts', {
    '@/lib/requireAdmin': { requireAdmin: async () => ({ user: actor }) },
    '@/lib/kits/free-kit-offer': { ...service, setTeamFreeKitOffer: async () => { writes++; return { changed: true }; } },
    'next/navigation': { redirect: (url) => { throw new Error(url); } },
    'next/cache': { revalidatePath() {} },
  }).updateManualFreeKitOfferAction;
  const form = new FormData(); form.set('teamId', 'lead-team'); form.set('enabled', 'false');
  await assert.rejects(Action(form), /confirm_required/);
  form.set('confirmed','yes'); form.set('enabled','invalid');
  await assert.rejects(Action(form), /invalid_request/);
  actor = null; form.set('enabled','false');
  await assert.rejects(Action(form), /login/);
  assert.equal(writes, 0);
});

test('captain offer APIs agree that an original-registration override is off', async () => {
  await set('lead-team', false);
  const route = load('src/app/api/captain/team/[teamid]/kit-offer-status/route.ts', common);
  const response = await route.GET(new Request('https://sixfl.co.uk'), { params: Promise.resolve({ teamid: 'lead-team' }) });
  assert.equal(response.body.existingEntitlement, false);
  assert.equal(response.body.offerAvailable, false);
  assert.equal(response.body.suppressed, true);
});

test('prepared pricing counts only paid kits after an override, even after a new order is saved', { skip: process.env.KIT_OFFER_PREPARED !== '1' }, async () => {
  await set('lead-team', false);
  await sql(`INSERT INTO "PaymentCharge" (id,"teamId",title,description,status) VALUES ('paid-kit','lead-team','Additional kit contribution • Test','1 additional complete kit for Original team at £20 each. Payment batch test-batch.','PAID')`);
  await sql(`INSERT INTO "PaymentTransaction" VALUES ('paid-receipt','paid-kit',2000)`);
  await sql(`INSERT INTO "TeamKitOrder" VALUES ('paid-order','lead-team','DRAFT',clock_timestamp()+interval '1 second')`);
  const quantity = load('src/lib/kits/extra-kit-quantity.ts', common);
  const summary = await quantity.getTeamExtraKitPaymentSummary('lead-team');
  assert.equal(summary.includedKitQuantity, 0);
  assert.equal(summary.paidExtraKitQuantity, 1);
  assert.equal(summary.totalKitQuantity, 1);
  const route = read('src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts');
  assert.match(route, /getTeamFreeKitOffer/);
  assert.match(route, /const purchaseOnly = !eligibility\.eligible/);
  assert.equal(summary.pendingExtraKitQuantity, 0);
});
