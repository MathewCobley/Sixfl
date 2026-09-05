const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function loader(mocks) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, fileName: filename,
    }).outputText;
    const localRequire = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      if (id.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), `${id}.ts`)));
      return require(id);
    };
    new Function("require", "module", "exports", source)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}
const policy = loader({})("src/lib/payments/team-payment-order-policy.ts");
const entry = (id, day, outstanding = 4000) => ({ chargeId: id, teamId: "team", title: id, fixtureId: id,
  dueDate: new Date(`2026-09-${day}T18:00:00Z`), kickoffAt: null, createdAt: new Date("2026-08-01"),
  outstandingPence: outstanding, displayStatus: outstanding ? "OPEN" : "PAID", paymentToken: "test-only" });
function order(entries) {
  const state = { entries, eligibleChargeIds: new Set(entries.map(e => e.chargeId)), unavailableChargeIds: new Set(), exceptions: new Map(), enabled: true };
  return { ledger: { entries }, enabled: true, next: policy.oldestPaymentOrderEntry(entries, new Map()),
    decision: chargeId => policy.decideTeamPaymentOrder({ ...state, chargeId }) };
}
function creditHarness(entries, initialCredit, failOrder = false) {
  let credit = initialCredit;
  const applied = [];
  const load = loader({
    "@/lib/prisma": { prisma: { team: { findUnique: async () => ({ id: "team", teamMode: "STANDARD", standardMatchFeePence: 4000 }) } } },
    "@/lib/payments/team-payment-ledger": { getRelatedTeamIdsForPaymentLedger: async () => ({ relatedTeamIds: ["team"] }) },
    "@/lib/payments/team-payment-order": { getTeamPaymentOrder: async () => { if (failOrder) throw new Error("Unavailable"); return order(entries); } },
    "@/lib/payments/team-credits": {
      getTeamCreditLedger: async () => ({ balancePence: credit }),
      applyAvailableTeamCreditToCharge: async input => {
        applied.push(input.chargeId);
        const target = entries.find(e => e.chargeId === input.chargeId);
        const used = Math.min(credit, target.outstandingPence);
        credit -= used; target.outstandingPence -= used;
        if (!target.outstandingPence) target.displayStatus = "PAID";
        return { amountUsedPence: used, remainingCreditPence: credit };
      },
    },
  });
  return { ...load("src/lib/payments/team-credit-policy.ts"), applied };
}
const applyCredit = h => h.applyExistingTeamCreditToChargeFirst({ teamId: "team", chargeId: "current", fixtureFeePence: 4000 });

test("unallocated credit settles oldest debt without falsely crediting the current squad fixture", async () => {
  const entries = [entry("older", "01"), entry("current", "02")];
  const h = creditHarness(entries, 1000);
  const result = await applyCredit(h);
  assert.deepEqual(h.applied, ["older"]);
  assert.equal(entries[0].outstandingPence, 3000);
  assert.equal(entries[1].outstandingPence, 4000);
  assert.equal(result.amountUsedPence, 0);
});

test("credit left after the oldest debt flows to current charge with accurate caller accounting", async () => {
  const entries = [entry("older", "01", 1000), entry("current", "02")];
  const h = creditHarness(entries, 4000);
  const result = await applyCredit(h);
  assert.deepEqual(h.applied, ["older", "current"]);
  assert.equal(result.amountUsedPence, 3000);
  assert.equal(result.policy.creditBalancePence, 0);
  assert.equal(entries[1].outstandingPence, 1000);
});

test("credit is not spent against an unrelated later fixture when requested charge is settled", async () => {
  const h = creditHarness([entry("current", "02", 0), entry("later", "09")], 4000);
  assert.equal((await applyCredit(h)).amountUsedPence, 0);
  assert.deepEqual(h.applied, []);
});

test("optional credit-order lookup failure does not block a genuine squad checkout", async () => {
  const h = creditHarness([entry("current", "02")], 1000, true);
  const result = await applyCredit(h);
  assert.equal(result.amountUsedPence, 0);
  assert.equal(result.policy.creditBalancePence, 1000);
  assert.deepEqual(h.applied, []);
});

function autoPayHarness(entries, options = {}) {
  const calls = [], queries = [];
  const due = { chargeId: "current", teamId: "team", teamName: "Test team", fixtureId: "current", title: "Current fixture",
    description: null, amountPence: 4000, paidPence: options.paidPence ?? 0, autoPayCapPence: options.cap ?? 4000,
    dueDate: new Date(), stripeCustomerId: "cus_test", stripeDefaultPaymentMethodId: "pm_test", autoPaySetupCheckoutSessionId: "cs_setup_test" };
  const db = {
    $queryRaw: async query => { queries.push(query); return query.sql.includes('INSERT INTO "PaymentTransaction"') ? [{ id: "test-receipt" }] : [due]; },
    $executeRaw: async query => { queries.push(query); return 1; },
  };
  const stripe = { paymentIntents: { create: async (input, request) => { calls.push({ input, request }); return { id: "pi_test", status: "succeeded", latest_charge: "ch_test" }; } } };
  const load = loader({
    "@/lib/prisma": { prisma: db },
    "@/lib/stripe/client": { getStripeServerClient: () => stripe },
    "@/lib/payments/match-day-billing": { isMatchFeeChargeDueToday: () => options.dueToday !== false },
    "@/lib/payments/team-autopay-verification": { verifyTeamAutoPayStripeEvidence: async () => ({ verified: options.verified !== false }) },
    "@/lib/payments/team-payment-order": { getTeamPaymentOrder: async () => { if (options.orderFailure) throw new Error("Priority unavailable"); return order(entries); } },
  });
  return { ...load("src/lib/payments/team-autopay.ts"), calls, queries, db, stripe };
}
const autoPay = h => h.chargeDueMatchdayAutoPayments({ db: h.db, stripe: h.stripe });

test("saved card pauses newer matchday charge rather than charging or reallocating arrears", async () => {
  const h = autoPayHarness([entry("older", "01"), entry("current", "02")]);
  const result = await autoPay(h);
  assert.equal(h.calls.length, 0);
  assert.equal(result[0].status, "skipped");
  assert.match(result[0].message, /earlier balance/);
  assert.equal(h.queries.some(q => q.sql.includes('INSERT INTO "PaymentTransaction"')), false);
});

test("saved card collects only canonical unpaid share of the approved current fixture", async () => {
  const h = autoPayHarness([entry("current", "02", 1500)]);
  const result = await autoPay(h);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].input.amount, 1500);
  assert.equal(h.calls[0].input.metadata.chargeId, "current");
  assert.match(h.calls[0].request.idempotencyKey, /^sixfl_matchday_autopay_current_/);
  assert.equal(result[0].amountPence, 1500);
});

test("saved-card amount cap, matchday-only mandate and setup verification remain enforced", async () => {
  const cap = autoPayHarness([entry("current", "02")], { cap: 3600 });
  await autoPay(cap);
  assert.equal(cap.calls[0].input.amount, 3600);
  const tomorrow = autoPayHarness([entry("current", "02")], { dueToday: false });
  assert.deepEqual(await autoPay(tomorrow), []); assert.equal(tomorrow.calls.length, 0);
  const unverified = autoPayHarness([entry("current", "02")], { verified: false });
  await autoPay(unverified); assert.equal(unverified.calls.length, 0);
  const unavailable = autoPayHarness([entry("current", "02")], { orderFailure: true });
  await autoPay(unavailable); assert.equal(unavailable.calls.length, 0);
});

test("admin action rejects non-admin, dev-bypass, invalid expiry and missing reasons before writes", async () => {
  const writes = [];
  let user = null;
  const db = { paymentCharge: { findUnique: async () => ({ id: "current", teamId: "team", team: { teamMode: "STANDARD" } }) },
    $queryRaw: async () => [], $executeRaw: async query => { writes.push(query); return 1; },
    $transaction: async fn => fn(db) };
  const load = loader({ "@/lib/prisma": { prisma: db }, "@/lib/requireAdmin": { requireAdmin: async () => ({ user }) },
    "@/lib/payments/team-payment-order-checkouts": { reconcileTeamPaymentOrderCheckouts: async () => ({}) },
    "next/cache": { revalidatePath: () => {} }, "next/navigation": { redirect: () => { throw new Error("REDIRECT"); } } });
  const { savePaymentOrderException } = load("src/app/(admin)/admin/payments/payment-order/actions.ts");
  const form = new FormData(); form.set("chargeId", "current"); form.set("action", "HOLD"); form.set("days", "7"); form.set("reason", "Admin reviewed case");
  await assert.rejects(savePaymentOrderException(form), /administrator is required/);
  assert.equal(writes.length, 0);
  user = { id: "admin-test", name: "Test admin", email: "admin@example.com" };
  form.set("days", "999"); await assert.rejects(savePaymentOrderException(form), /1–30/);
  form.set("days", "7"); form.set("reason", ""); await assert.rejects(savePaymentOrderException(form), /reason/);
  assert.equal(writes.length, 0);
  form.set("reason", "Admin reviewed case"); await assert.rejects(savePaymentOrderException(form), /REDIRECT/);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].values.includes("admin-test"));
  assert.ok(writes[0].values.includes("Admin reviewed case"));
});
