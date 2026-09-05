const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { Prisma } = require("@prisma/client");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      reportDiagnostics: true,
    });
    assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    const localRequire = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      if (id.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), `${id}.ts`)));
      return require(id);
    };
    new Function("require", "module", "exports", compiled.outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}
const policy = loader()("src/lib/payments/team-payment-order-policy.ts");
const date = text => new Date(text);
function entry(chargeId, due = "2026-09-02T19:30:00Z", extra = {}) {
  return { chargeId, teamId: "team-a", fixtureId: `fixture-${chargeId}`, title: `Match ${chargeId}`,
    paymentToken: `test-token-${chargeId}`, dueDate: date(due), kickoffAt: date(due),
    createdAt: date("2026-08-01T12:00:00Z"), outstandingPence: 4000, amountPence: 4000, displayStatus: "OPEN", ...extra };
}
const older = () => entry("abandoned", "2026-08-19T19:30:00Z", { title: "Abandoned match fees", amountPence: 8000, displayStatus: "PART_PAID" });
const current = () => entry("current");
function decision(entries, chargeId, extra = {}) {
  return policy.decideTeamPaymentOrder({ entries, chargeId, eligibleChargeIds: new Set(entries.map(e => e.chargeId)),
    unavailableChargeIds: new Set(), exceptions: new Map(), enabled: true, ...extra });
}
function order(entries, extra = {}) {
  const exceptions = extra.exceptions ?? new Map();
  return { enabled: true, ledger: { entries, relatedTeamIds: ["team-a"] },
    next: policy.oldestPaymentOrderEntry(entries, exceptions), overdue: policy.overduePaymentOrderEntries(entries, date("2026-09-05T12:00:00Z")),
    exceptions, decision: id => decision(entries, id, extra), ...extra };
}

test("part-paid abandoned charge blocks newer direct team payment for the remaining £40", () => {
  const rows = [current(), older()];
  const result = decision(rows, "current");
  assert.equal(result.allowed, false);
  assert.equal(result.code, "OLDER_BALANCE");
  assert.equal(result.blocker.outstandingPence, 4000);
  assert.equal(decision(rows, "abandoned").allowed, true);
  assert.match(policy.paymentOrderMessage(result), /£40\.00/);
});

test("settlement unlocks the next charge without moving any historic receipt", () => {
  const rows = [entry("paid", "2026-08-01T00:00:00Z", { displayStatus: "PAID", outstandingPence: 0 }), current(), older()];
  const before = structuredClone(rows);
  decision(rows, "current");
  assert.deepEqual(rows, before);
  rows[2].outstandingPence = 0;
  rows[2].displayStatus = "PAID";
  assert.equal(decision(rows, "current").allowed, true);
  assert.deepEqual(rows[0], before[0]);
});

test("void and fully waived/covered charges do not block payment", () => {
  for (const old of [older(), older(), older()]) {
    old.outstandingPence = 0;
    assert.equal(decision([old, current()], "current").allowed, true);
  }
  assert.equal(decision([older(), current()], "current", { unavailableChargeIds: new Set(["abandoned"]), eligibleChargeIds: new Set(["current"]) }).allowed, true);
  assert.equal(decision([entry("void", "2026-08-01T00:00:00Z", { displayStatus: "VOID" }), current()], "current").allowed, true);
});

test("due date, not insertion date, controls priority with deterministic ties", () => {
  const old = older(); old.createdAt = date("2026-09-05T00:00:00Z");
  assert.equal(decision([current(), old], "current").blocker.chargeId, "abandoned");
  assert.equal(policy.comparePaymentOrder(entry("a"), entry("b")) < 0, true);
  const fallback = entry("fallback", undefined, { dueDate: null, kickoffAt: null });
  assert.equal(policy.paymentOrderDate(fallback), fallback.createdAt);
});

test("early payment remains available for the oldest future charge only", () => {
  const rows = [entry("next", "2028-09-01T12:00:00Z"), entry("later", "2028-09-08T12:00:00Z")];
  assert.equal(decision(rows, "next").allowed, true);
  assert.equal(decision(rows, "later").allowed, false);
});

test("managed and pre-conversion history cannot block current standard-team payments", () => {
  const rows = [older(), current()];
  assert.equal(decision(rows, "current", { enabled: false }).code, "EXEMPT");
  assert.equal(decision(rows, "current", { eligibleChargeIds: new Set(["current"]) }).allowed, true);
});

test("hold pauses this charge, retains its debt, and allows the next charge", () => {
  const rows = [older(), current()];
  const exceptions = new Map([["abandoned", { chargeId: "abandoned", action: "HOLD" }]]);
  assert.equal(decision(rows, "abandoned", { exceptions }).code, "ON_HOLD");
  assert.equal(decision(rows, "current", { exceptions }).allowed, true);
  assert.equal(rows[0].outstandingPence, 4000);
  assert.equal(policy.overduePaymentOrderEntries(rows, date("2026-09-05T12:00:00Z")).length, 2);
});

test("admin override applies to one charge only and expiry/reset restores policy", () => {
  const now = date("2026-09-05T12:00:00Z");
  const exception = { chargeId: "current", action: "ALLOW_PAYMENT", reason: "Reviewed by admin", expiresAt: date("2026-09-06T00:00:00Z") };
  const rows = [older(), current(), entry("third", "2026-09-09T12:00:00Z")];
  const exceptions = policy.activePaymentOrderExceptions([exception], now);
  assert.equal(decision(rows, "current", { exceptions }).code, "OVERRIDE");
  assert.equal(decision(rows, "third", { exceptions }).allowed, false);
  assert.equal(policy.activePaymentOrderExceptions([{ ...exception, action: "RESET", expiresAt: null }], now).size, 0);
  assert.equal(policy.activePaymentOrderExceptions([exception], date("2026-09-07T00:00:00Z")).size, 0);
});

test("arrears warning uses London calendar days and remains after newer squad settlement", () => {
  const today = entry("today", "2026-09-05T19:00:00Z");
  const paidViaSquad = current(); paidViaSquad.displayStatus = "PAID"; paidViaSquad.outstandingPence = 0;
  const overdue = policy.overduePaymentOrderEntries([older(), paidViaSquad, today], date("2026-09-05T19:30:00Z"));
  assert.deepEqual(overdue.map(item => item.chargeId), ["abandoned"]);
  assert.equal(policy.overduePaymentOrderEntries([today], date("2026-09-05T23:30:00Z")).length, 1);
});

function serviceHarness({ entries = [older(), current()], enabled = true, boundary = null, statuses, exceptions = [], failure = false } = {}) {
  const ledger = { entries, relatedTeamIds: ["team-a"], teamId: "team-a" };
  const queries = [];
  const prisma = {
    fixture: { findMany: async () => entries.map(e => ({ id: e.fixtureId, status: statuses?.[e.chargeId] ?? "COMPLETED" })) },
    paymentCharge: { findUnique: async () => ({ teamId: "team-a" }) },
    $queryRaw: async query => { queries.push(query); if (failure) throw new Error("DB unavailable"); return exceptions; },
  };
  const load = loader({ "@/lib/prisma": { prisma }, "@/lib/payments/team-payment-ledger": {
    getTeamPaymentLedger: async () => ledger,
    getRelatedTeamIdsForPaymentLedger: async () => ({ team: { teamMode: enabled ? "STANDARD" : "MANAGED", standardCreditStartedAt: boundary }, relatedTeamIds: ledger.relatedTeamIds }),
  } });
  return { ...load("src/lib/payments/team-payment-order.ts"), queries, ledger };
}

test("shared service uses canonical balances, excludes cancelled fixtures, respects conversion boundary", async () => {
  const h = serviceHarness({ statuses: { abandoned: "CANCELLED" } });
  assert.equal((await h.getTeamPaymentOrder("team-a")).decision("current").allowed, true);
  const boundary = serviceHarness({ boundary: date("2026-08-25T00:00:00Z") });
  assert.equal((await boundary.getTeamPaymentOrder("team-a")).decision("current").allowed, true);
  const settled = serviceHarness({ entries: [{ ...older(), outstandingPence: 0, displayStatus: "PAID" }, current()] });
  assert.equal((await settled.getTeamPaymentOrder("team-a")).decision("current").allowed, true);
});

test("latest exception wins before expiry filtering and a storage outage fails closed", async () => {
  const h = serviceHarness();
  await h.getTeamPaymentOrder("team-a");
  assert.match(h.queries[0].sql, /DISTINCT ON \("chargeId"\)/);
  assert.match(h.queries[0].sql, /ORDER BY "chargeId", "id" DESC/);
  await assert.rejects(serviceHarness({ failure: true }).assertTeamChargePaymentOrder("current"), /DB unavailable/);
});

function checkoutHarness(rows, selected = "current", options = {}) {
  const created = [], credited = [], retrieved = [], updates = [];
  let orderCalls = 0;
  const charge = { id: selected, teamId: "team-a", fixtureId: `fixture-${selected}`, paymentToken: "test-token", amountPence: 4000, status: "OPEN", title: "Selected fixture", description: null,
    transactions: [], team: { contactEmail: "captain@example.com" }, fixture: { status: "COMPLETED", league: { slug: "example" } },
    lastStripeCheckoutSessionId: options.session?.id ?? null };
  const stripe = { checkout: { sessions: {
    create: async input => { created.push(input); return { id: "new-session", url: "https://checkout.stripe.test/new" }; },
    retrieve: async id => { retrieved.push(id); return options.session; },
    expire: async () => ({}),
  } } };
  const prisma = {
    paymentCharge: { findUnique: async () => charge, update: async input => { updates.push(input); return {}; } },
    playerMatchFee: { findMany: async () => [] },
    paymentTransaction: { findMany: async () => [], findUnique: async () => options.recorded ? { id: "receipt" } : null },
  };
  const load = loader({
    "@/lib/prisma": { prisma },
    "next/server": { NextResponse: { redirect: (url, status) => new Response(null, { status, headers: { location: String(url) } }) } },
    "@/lib/stripe/client": { getPublicSiteUrl: () => "https://sixfl.test", getStripeServerClient: () => stripe },
    "@/lib/payments/team-payment-order": { getTeamPaymentOrder: async () => { orderCalls++; if (options.orderError) throw new Error("Cannot verify priority"); return order(options.changeAfterFirst && orderCalls > 1 ? [older(), current()] : rows); } },
    "@/lib/payments/team-credit-policy": { applyExistingTeamCreditToChargeFirst: async input => { credited.push(input); return {}; } },
    "@/lib/payments/charge-summary": { summariseChargesWithPlayerMatchFees: () => [{ outstandingPence: 4000 }] },
  });
  return { ...load("src/app/pay/charge/[token]/start/route.ts"), created, credited, retrieved, updates, stripe, load };
}
const post = h => h.POST(new Request("https://sixfl.test/pay/charge/test-token/start?bypass=1", { method: "POST" }), { params: Promise.resolve({ token: "test-token" }) });

test("old direct token is blocked before Stripe or applying credit despite bypass query", async () => {
  const h = checkoutHarness([older(), current()]);
  const response = await post(h);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://sixfl.test/pay/charge/test-token");
  assert.equal(h.created.length, 0); assert.equal(h.credited.length, 0); assert.equal(h.retrieved.length, 0);
});

test("permitted direct checkout uses canonical remaining balance and correct stated charge", async () => {
  const h = checkoutHarness([current()], "current");
  const response = await post(h);
  assert.equal(response.status, 303);
  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].metadata.chargeId, "current");
  assert.equal(h.created[0].metadata.type, "team_charge");
  assert.equal(h.created[0].line_items[0].price_data.unit_amount, 4000);
  assert.equal(h.credited.length, 1);
});

test("priority is rechecked after settlement and before reusing any Stripe checkout", async () => {
  const h = checkoutHarness([current()], "current", { changeAfterFirst: true, session: { id: "old-open" } });
  await post(h);
  assert.equal(h.created.length, 0); assert.equal(h.retrieved.length, 0);
});

test("cannot open checkout when priority storage is unavailable", async () => {
  const h = checkoutHarness([current()], "current", { orderError: true });
  await assert.rejects(post(h), /Cannot verify priority/);
  assert.equal(h.created.length, 0);
});

function session(extra = {}) {
  return { id: "cs_test_direct", mode: "payment", client_reference_id: "current", metadata: { chargeId: "current", teamId: "team-a" }, status: "open", amount_total: 4000, url: "https://checkout.stripe.test/existing", ...extra };
}

test("cached expired session is replaced; completed unrecorded payment prevents double payment", async () => {
  const expired = checkoutHarness([current()], "current", { session: session({ status: "expired" }) });
  await post(expired); assert.equal(expired.created.length, 1);
  const complete = checkoutHarness([current()], "current", { session: session({ status: "complete" }) });
  const response = await post(complete);
  assert.equal(complete.created.length, 0);
  assert.match(response.headers.get("location"), /pending=1$/);
});

test("verified open cache is reused only for its exact amount and original charge", async () => {
  const h = checkoutHarness([current()], "current", { session: session() });
  const response = await post(h);
  assert.equal(h.created.length, 0);
  assert.equal(response.headers.get("location"), session().url);
  const wrong = checkoutHarness([current()], "current", { session: session({ client_reference_id: "other" }) });
  await assert.rejects(post(wrong), /could not be verified/);
  assert.equal(wrong.created.length, 0);
});

function scanHarness(sessions, options = {}) {
  const expired = [], updates = [], queries = [], lists = [];
  const prisma = {
    $queryRaw: async query => { queries.push(query); return options.busy ? [] : [{ cursor: options.cursor ?? null }]; },
    $executeRaw: async query => { queries.push(query); return 1; },
    paymentCharge: { findUnique: async ({ where }) => where.id ? { teamId: "team-a" } : null, updateMany: async input => { updates.push(input); return { count: 1 }; } },
  };
  const stripe = { checkout: { sessions: {
    list: async input => { lists.push(input); return { data: sessions, has_more: options.more ?? false }; },
    expire: async id => { if (options.expireFailure) throw new Error("Provider not available"); expired.push(id); return {}; },
    retrieve: async () => session({ status: options.race ? "complete" : "open" }),
  } } };
  const load = loader({ "@/lib/prisma": { prisma }, "@/lib/stripe/client": { getStripeServerClient: () => stripe },
    "@/lib/payments/team-payment-order": { getTeamPaymentOrder: async () => order([older(), current()]) } });
  return { ...load("src/lib/payments/team-payment-order-checkouts.ts"), expired, updates, queries, stripe, lists };
}

test("cleanup expires only conflicting direct sessions, including uncached legacy sessions", async () => {
  const excluded = [
    session({ id: "player", metadata: { chargeId: "current", teamId: "team-a", playerMatchFeeId: "fee" } }),
    session({ id: "captain", metadata: { chargeId: "current", teamId: "team-a", type: "captain_collected_remittance" } }),
    session({ id: "kit", metadata: { chargeId: "current", teamId: "team-a", type: "extra_kit" } }),
    session({ id: "setup", mode: "setup" }),
    session({ id: "unverified", client_reference_id: "unrelated" }),
  ];
  const h = scanHarness([session(), ...excluded, session({ id: "uncached-legacy" })]);
  const result = await h.reconcileTeamPaymentOrderCheckouts({ stripe: h.stripe });
  assert.equal(result.expired, 2);
  assert.deepEqual(h.expired, ["cs_test_direct", "uncached-legacy"]);
  assert.ok(h.updates.every(item => item.where.lastStripeCheckoutSessionId));
  assert.ok(h.queries.some(q => q.sql?.includes('"TeamPaymentOrderCheckoutAudit"')));
});

test("cleanup is resumable and leased, and a failed expiry is retried rather than silently ignored", async () => {
  const h = scanHarness([session()], { cursor: "previous-page", more: true });
  const result = await h.reconcileTeamPaymentOrderCheckouts({ stripe: h.stripe });
  assert.equal(result.hasMore, true);
  assert.equal(h.lists[0].starting_after, "previous-page");
  assert.ok(h.queries.some(q => q.values?.includes("cs_test_direct") && q.sql?.includes('"cursor" =')));
  const busy = scanHarness([], { busy: true });
  assert.equal((await busy.reconcileTeamPaymentOrderCheckouts({ stripe: busy.stripe })).busy, true);
  assert.equal(busy.lists.length, 0);
  const failure = scanHarness([session()], { expireFailure: true });
  await assert.rejects(failure.reconcileTeamPaymentOrderCheckouts({ stripe: failure.stripe }), /cleanup failed/);
  assert.equal(failure.updates.length, 0);
});

test("a payment completing during expiration keeps its original allocation and is audited", async () => {
  const h = scanHarness([session()], { expireFailure: true, race: true });
  const result = await h.reconcileTeamPaymentOrderCheckouts({ stripe: h.stripe });
  assert.equal(result.inFlight, 1);
  assert.equal(h.updates.length, 0);
  assert.ok(h.queries.some(q => q.values?.includes("COMPLETED_OUT_OF_ORDER")));
});

test("prepared source retains gates on UI, POST, saved card and unallocated credit", () => {
  const captain = read("src/app/captain/team/[teamid]/payments/page.tsx");
  assert.ok(captain.includes('data-team-payment-order="oldest-first"'));
  assert.ok(captain.includes("const canPayOnline = paymentDecision.allowed"));
  assert.ok(captain.includes("const canUseCredit = paymentDecision.allowed"));
  assert.ok(captain.includes("<TeamPaymentOrderNotice decision={paymentDecision} />"));
  assert.ok(captain.includes("Older team balance outstanding"));
  const publicPage = read("src/app/pay/charge/[token]/page.tsx");
  assert.ok(publicPage.includes("const canPay = paymentDecision.allowed"));
  const auto = read("src/lib/payments/team-autopay.ts");
  assert.ok(auto.indexOf("const paymentDecision = paymentOrder.decision(row.chargeId)") < auto.indexOf("stripe.paymentIntents.create"));
  assert.ok(auto.includes("Saved-card payment paused."));
  assert.ok(auto.includes("amount: collectionPence"));
  assert.ok(auto.includes("if (chargeAmountPence > autoPayCapPence)"));
  assert.ok(auto.includes("sixfl_matchday_autopay_${row.chargeId}_${chargeAmountPence}"));
  const credits = read("src/lib/payments/team-credits.ts");
  assert.ok(credits.includes("await assertTeamChargePaymentOrder(current.charge.id)"));
  const collectedCredit = read("src/app/captain/team/[teamid]/payments/use-credit-for-collected/route.ts");
  assert.ok(collectedCredit.includes("await assertTeamChargePaymentOrder(charge.id)"));
  const creditPolicy = read("src/lib/payments/team-credit-policy.ts");
  assert.ok(creditPolicy.includes("order.enabled ? order.next"));
  assert.ok(creditPolicy.includes("if (target.chargeId === input.chargeId) amountUsedPence"));
  assert.ok(creditPolicy.includes("targetDate > requestedDate"));
});

test("squad and captain-collected CASH checkouts remain exempt while callbacks retain exact charge allocation", () => {
  for (const file of ["src/app/pay/player-match-fee/[token]/start/route.ts", "src/app/captain/team/[teamid]/payments/remit-collected/route.ts"]) {
    const source = read(file);
    assert.equal(source.includes("assertTeamChargePaymentOrder"), false);
    assert.equal(source.includes("getTeamPaymentOrder"), false);
  }
  const remit = read("src/app/captain/team/[teamid]/payments/remit-collected/route.ts");
  assert.ok(remit.includes("snapshot.availablePence"));
  assert.ok(remit.includes('type: "captain_collected_remittance"'));
  const webhook = read("src/app/api/stripe/webhook/route.ts");
  assert.equal(webhook.includes("getTeamPaymentOrder"), false);
  assert.equal(webhook.includes("oldestPaymentOrderEntry"), false);
});

test("admin controls require authenticated admin identity, reason, expiry and append-only audit", () => {
  const actions = read("src/app/(admin)/admin/payments/payment-order/actions.ts");
  assert.ok(actions.includes("await requireAdmin()"));
  assert.ok(actions.includes("if (!user?.id) throw"));
  assert.ok(actions.includes("reason.length < 5"));
  assert.ok(actions.includes("days > 30"));
  assert.ok(actions.includes('INSERT INTO "TeamPaymentOrderException"'));
  assert.equal(actions.includes('DELETE FROM "TeamPaymentOrderException"'), false);
  assert.ok(read("src/components/admin/AdminSidebar.tsx").includes('href: "/admin/payments/payment-order"'));
  assert.ok(read("src/app/api/cron/notifications/route.ts").includes('"team-payment-order-checkouts"'));
});
