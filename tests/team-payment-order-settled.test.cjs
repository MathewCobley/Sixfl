const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Run real policy, read service and presentation with in-memory data only.
// No database connections, Stripe calls, financial writes or notifications.
const root = path.resolve(__dirname, "..");
const policyPath = "src/lib/payments/team-payment-order-policy.ts";
const read = file => fs.readFileSync(path.join(root, file), "utf8");
function loader(mocks = {}, transformPolicy = source => source) {
  const cache = new Map();
  function load(file) {
    let filename = path.resolve(root, file);
    if (!fs.existsSync(filename)) filename = [filename + ".ts", filename + ".tsx"].find(fs.existsSync);
    assert.ok(filename, `Missing test dependency: ${file}`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = fs.readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(filename === path.join(root, policyPath) ? transformPolicy(source) : source, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      reportDiagnostics: true,
    });
    assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    const localRequire = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}`);
      if (id.startsWith(".")) return load(path.resolve(path.dirname(filename), id));
      return require(id);
    };
    new Function("require", "module", "exports", compiled.outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}
const policy = loader()(policyPath);
function entry(extra = {}) {
  return { chargeId: "historic", teamId: "test-team", fixtureId: "test-fixture", title: "Historical match fee",
    paymentToken: "test-only-token", dueDate: new Date("2026-07-14T18:00:00Z"), kickoffAt: new Date("2026-07-14T18:00:00Z"),
    createdAt: new Date("2026-07-01T12:00:00Z"), amountPence: 4000, paidPence: 4000, outstandingPence: 0, displayStatus: "PAID", ...extra };
}
function state(row, extra = {}) {
  return { entries: [row], chargeId: row.chargeId, eligibleChargeIds: new Set([row.chargeId]),
    unavailableChargeIds: new Set([row.chargeId]), exceptions: new Map(), enabled: true, ...extra };
}
const settledCases = [
  { displayStatus: "PAID", outstandingPence: 0 },
  { displayStatus: "PAID", outstandingPence: 4000 },
  { displayStatus: "VOID", outstandingPence: 4000 },
  { displayStatus: "OPEN", outstandingPence: 0 },
  { displayStatus: "PART_PAID", outstandingPence: 0 },
  { displayStatus: "OPEN", outstandingPence: -500 },
];
function assertSettled(decide) {
  for (const fields of settledCases) {
    for (const enabled of [true, false]) {
      const row = entry(fields);
      const input = state(row, { enabled });
      const before = structuredClone(input);
      assert.deepEqual(decide(input), { allowed: false, code: "SETTLED", blocker: null });
      assert.deepEqual(input, before, "Classification must not mutate ledger, exceptions or receipts.");
    }
  }
}

test("paid, void and fully covered charges are settled even when the fixture is unavailable", () => {
  assertSettled(policy.decideTeamPaymentOrder);
});

test("the regression rejects the old availability-before-settlement behaviour", () => {
  const regressed = loader({}, source => {
    const marker = "  // Settlement comes from the ledger";
    assert.equal(source.split(marker).length, 2);
    return source.replace(marker, '  if (input.unavailableChargeIds.has(input.chargeId)) return { allowed: false, code: "UNAVAILABLE", blocker: null };\n' + marker);
  })(policyPath);
  assert.throws(() => assertSettled(regressed.decideTeamPaymentOrder), { code: "ERR_ASSERTION" });
});

test("missing and genuinely unpaid unavailable charges remain blocked, even with an override or exemption", () => {
  const row = entry({ displayStatus: "OPEN", outstandingPence: 4000 });
  assert.deepEqual(policy.decideTeamPaymentOrder(state(row, { entries: [] })), { allowed: false, code: "UNAVAILABLE", blocker: null });
  for (const enabled of [true, false]) {
    for (const action of ["HOLD", "ALLOW_PAYMENT"]) {
      const exceptions = new Map([[row.chargeId, { chargeId: row.chargeId, action }]]);
      assert.deepEqual(policy.decideTeamPaymentOrder(state(row, { enabled, exceptions, eligibleChargeIds: new Set() })),
        { allowed: false, code: "UNAVAILABLE", blocker: null });
    }
  }
});

test("unpaid holds and oldest-first rules retain their original decisions", () => {
  const row = entry({ displayStatus: "PART_PAID", outstandingPence: 1000 });
  const unpaid = state(row, { unavailableChargeIds: new Set() });
  assert.equal(policy.decideTeamPaymentOrder(unpaid).code, "NEXT");
  const exceptions = new Map([[row.chargeId, { chargeId: row.chargeId, action: "HOLD" }]]);
  assert.equal(policy.decideTeamPaymentOrder({ ...unpaid, exceptions }).code, "ON_HOLD");
  const earlier = entry({ chargeId: "earlier", displayStatus: "OPEN", outstandingPence: 4000, dueDate: new Date("2026-06-01") });
  const blocked = policy.decideTeamPaymentOrder({ ...unpaid, entries: [earlier, row], eligibleChargeIds: new Set([earlier.chargeId, row.chargeId]) });
  assert.equal(blocked.code, "OLDER_BALANCE");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blocker.chargeId, earlier.chargeId);
});

function harness(fields = {}, fixtureStatus = "CANCELLED", teamMode = "STANDARD") {
  const row = entry(fields);
  const fixture = fixtureStatus === null ? null : { id: row.fixtureId, status: fixtureStatus, kickoffAt: row.kickoffAt,
    homeTeam: { name: "Test Home" }, awayTeam: { name: "Test Away" }, league: { name: "Test League", slug: "test-league", season: "Summer" } };
  const charge = { id: row.chargeId, teamId: row.teamId, fixtureId: row.fixtureId, title: row.title, description: null,
    amountPence: row.amountPence, status: row.displayStatus, paymentToken: row.paymentToken, dueDate: row.dueDate,
    team: { id: row.teamId, name: "Test Team", teamMode }, fixture, transactions: [{ amountPence: row.paidPence }] };
  const ledger = { entries: [row], relatedTeamIds: [row.teamId], teamId: row.teamId };
  const db = {
    fixture: { findMany: async () => fixture ? [fixture] : [] },
    paymentCharge: { findUnique: async () => charge },
    playerMatchFee: { findMany: async () => [] },
    paymentTransaction: { findMany: async () => [] },
    $queryRaw: async () => [],
  };
  const mocks = {
    "@/lib/prisma": { prisma: db },
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/payments/team-payment-ledger": {
      getTeamPaymentLedger: async () => ledger,
      getRelatedTeamIdsForPaymentLedger: async () => ({ team: { teamMode, standardCreditStartedAt: null }, relatedTeamIds: ledger.relatedTeamIds }),
      formatPaymentFixtureDate: value => value.toISOString(),
      formatPaymentMoney: value => `£${(value / 100).toFixed(2)}`,
    },
  };
  const load = loader(mocks);
  return { row, ledger, charge, load, ...load("src/lib/payments/team-payment-order.ts") };
}

test("shared read service and server payment guard recognise settled cancelled, postponed and missing fixtures", async () => {
  for (const status of ["CANCELLED", "POSTPONED", "SCHEDULED", "COMPLETED", null]) {
    for (const teamMode of ["STANDARD", "MANAGED"]) {
      const h = harness({}, status, teamMode);
      const before = structuredClone(h.ledger);
      const order = await h.getTeamPaymentOrder("test-team");
      assert.deepEqual(order.decision("historic"), { allowed: false, code: "SETTLED", blocker: null });
      await assert.rejects(h.assertTeamChargePaymentOrder("historic"), error => error.decision?.code === "SETTLED");
      assert.deepEqual(h.ledger, before);
    }
  }
});

test("shared rendered notice is absent for settled rows but remains visible for actual restrictions", () => {
  const h = harness();
  const { TeamPaymentOrderNotice } = h.load("src/components/payments/TeamPaymentOrderNotice.tsx");
  for (const fields of settledCases) {
    const result = policy.decideTeamPaymentOrder(state(entry(fields)));
    assert.equal(renderToStaticMarkup(React.createElement(TeamPaymentOrderNotice, { decision: result })), "");
  }
  for (const code of ["UNAVAILABLE", "ON_HOLD"]) {
    const html = renderToStaticMarkup(React.createElement(TeamPaymentOrderNotice, { decision: { allowed: false, code, blocker: null } }));
    assert.match(html, /role="status"/);
    assert.match(html, /Squad payments/);
  }
});

test("actual prepared payment-link page shows settled balance instead of an inactive-fixture warning", async () => {
  for (const status of ["CANCELLED", "POSTPONED", "COMPLETED", null]) {
    for (const fields of [{}, { displayStatus: "OPEN", outstandingPence: 0 }]) {
      const h = harness(fields, status);
      const page = h.load("src/app/pay/charge/[token]/page.tsx").default;
      const html = renderToStaticMarkup(await page({ params: Promise.resolve({ token: "test-only-token" }) }));
      assert.match(html, /This charge is settled; no further payment is required/);
      assert.match(html, /£0\.00/);
      assert.doesNotMatch(html, /not currently available|no longer active|Continue to secure payment/);
    }
  }
});

test("public payment page preserves void, unpaid-cancelled and payable states", async () => {
  for (const [fields, fixtureStatus, expected] of [
    [{ displayStatus: "VOID", outstandingPence: 0 }, "CANCELLED", /no longer active/],
    [{ displayStatus: "OPEN", outstandingPence: 4000, paidPence: 0 }, "CANCELLED", /not currently available/],
    [{ displayStatus: "OPEN", outstandingPence: 4000, paidPence: 0 }, "SCHEDULED", /Continue to secure payment/],
  ]) {
    const h = harness(fields, fixtureStatus);
    const html = renderToStaticMarkup(await h.load("src/app/pay/charge/[token]/page.tsx").default({ params: Promise.resolve({ token: "test-only-token" }) }));
    assert.match(html, expected);
    if (fixtureStatus === "CANCELLED") assert.doesNotMatch(html, /Continue to secure payment/);
  }
});

test("post-prebuild repository search keeps the warning and decision in their shared sources", () => {
  const grep = expression => execFileSync("git", ["grep", "-l", "-E", expression, "--", "src", "scripts"], { cwd: root, encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(grep("export function decideTeamPaymentOrder"), [policyPath]);
  assert.deepEqual(grep("This charge is not currently available for direct payment"), [policyPath]);
  const consumers = grep("TeamPaymentOrderNotice|getTeamPaymentOrder|assertTeamChargePaymentOrder");
  console.log("Payment-order consumers checked after source preparation:\n" + consumers.join("\n"));
  assert.ok(consumers.includes("src/app/captain/team/[teamid]/payments/page.tsx"));
  assert.ok(consumers.includes("src/app/pay/charge/[token]/page.tsx"));
  assert.ok(consumers.includes("src/app/pay/charge/[token]/start/route.ts"));
  assert.ok(consumers.includes("src/lib/payments/team-autopay.ts"));
});
