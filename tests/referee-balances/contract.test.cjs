const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { Prisma, FixtureStatus } = require("@prisma/client");

function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (id) => (id in mocks ? mocks[id] : require(id)),
    mod,
    mod.exports,
  );
  return mod.exports;
}

test("canonical referee balance ignores future, settled and already-paid amounts", () => {
  const lib = load("src/lib/referee-nights.ts", {
    "@prisma/client": { Prisma, FixtureStatus },
    "@/lib/datetime/london": {
      formatDateTimeInLondon: () => "",
      toLondonDateInputValue: () => "2026-09-23",
    },
    "@/lib/prisma": { prisma: {} },
  });

  const base = {
    status: "APPROVED",
    nightDate: "2026-09-22",
    dueToRefereePence: 4000,
    cashPaidToRefereePence: 0,
    dueToSixflPence: 0,
    cashReceivedFromRefereePence: 0,
  };

  assert.equal(lib.getRefereePayableDueToRefereePence(base, "2026-09-23"), 4000);
  assert.equal(
    lib.getRefereePayableDueToRefereePence(
      { ...base, cashPaidToRefereePence: 4000 },
      "2026-09-23",
    ),
    0,
  );
  assert.equal(
    lib.getRefereePayableDueToRefereePence(
      { ...base, nightDate: "2026-09-23" },
      "2026-09-23",
    ),
    0,
  );
  assert.equal(
    lib.getRefereePayableDueToRefereePence(
      { ...base, nightDate: "2026-09-29" },
      "2026-09-23",
    ),
    0,
  );
  assert.equal(
    lib.getRefereePayableDueToRefereePence(
      { ...base, status: "SETTLED" },
      "2026-09-23",
    ),
    0,
  );
});

test("aggregate referee payment allocates oldest outstanding nights without overpaying", async () => {
  const writes = [];
  let redirectedTo = null;
  const prisma = {
    $queryRaw: async () => [
      {
        id: "night-old",
        nightDate: "2026-09-15",
        dueToRefereePence: 3000,
        cashPaidToRefereePence: 0,
      },
      {
        id: "night-new",
        nightDate: "2026-09-16",
        dueToRefereePence: 2000,
        cashPaidToRefereePence: 0,
      },
    ],
    $transaction: async (callback) =>
      callback({
        $executeRaw: async (sql) => {
          writes.push(sql);
          return 1;
        },
      }),
  };

  const actions = load("src/app/(admin)/admin/referee-nights/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/navigation": {
      redirect(url) {
        redirectedTo = url;
        throw Object.assign(new Error("redirect"), { url });
      },
    },
    "@/lib/datetime/london": { toLondonDateInputValue: () => "2026-09-23" },
    "@/lib/referees/evening-notifications": {
      scheduleRefereeEveningForNight: async () => {},
    },
    "@/lib/referee-nights": {
      createRefereeNightId: () => "id",
      findFixturesForNight: async () => [],
      parseMoneyToPence(value) {
        const number = Number(String(value ?? "").replace(/[£,\s]/g, ""));
        return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
      },
      recalculateRefereeNightCashup: async () => {},
    },
    "@/lib/prisma": { prisma },
    "@/lib/requireAdmin": { requireAdmin: async () => ({ user: { id: "admin" } }) },
    "@/lib/referees/profile": { getRefereeProfileByUserId: async () => null },
    "@prisma/client": { Prisma },
  });

  const form = new FormData();
  form.set("refereeId", "ref-1");
  form.set("paymentPounds", "40.00");
  form.set("paymentMethod", "CASH");

  await assert.rejects(actions.recordRefereePaymentAction(form), /redirect/);

  assert.equal(writes.length, 2);
  assert.ok(writes[0].values.includes(3000), "first £30 goes to oldest night");
  assert.ok(writes[0].values.includes("night-old"));
  assert.ok(writes[1].values.includes(1000), "remaining £10 goes to next night");
  assert.ok(writes[1].values.includes("night-new"));
  assert.match(String(writes[0].values.find((value) => typeof value === "string" && value.includes("Referee payment"))), /cash/);
  assert.match(redirectedTo, /payment=recorded/);
});

test("admin referee page is referee-first, with night detail secondary", () => {
  const page = fs.readFileSync("src/app/(admin)/admin/referee-nights/page.tsx", "utf8");
  assert.match(page, /Who do we owe\?/);
  assert.match(page, /One balance per referee/);
  assert.match(page, /Paid cash/);
  assert.match(page, /Bank paid/);
  assert.match(page, /recordRefereePaymentAction/);
  assert.match(page, /Night-by-night audit/);
  assert.match(page, /getRefereePayableDueToRefereePence/);
});


test("referee app ledger uses a simple app-native money heading", () => {
  const page = fs.readFileSync("src/app/(public)/referee/ledger/page.tsx", "utf8");
  assert.match(page, />Your money</);
  assert.doesNotMatch(page, /Referee earnings/i);
  assert.doesNotMatch(page, /Payment history/i);
});
